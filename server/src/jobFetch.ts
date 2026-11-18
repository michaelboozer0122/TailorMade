import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;

export class JobFetchError extends Error {}

export interface FetchedJob {
  url: string;
  text: string;
}

/** Fetches a job listing page and returns readable text. Blocks private/internal addresses. */
export async function fetchJobPosting(rawUrl: string): Promise<FetchedJob> {
  let url = new URL(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);

    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TailorMadeBot/1.0)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new JobFetchError("The job link redirected without a destination.");
      url = new URL(location, url);
      continue;
    }

    if (!res.ok) {
      throw new JobFetchError(
        `The job site responded with ${res.status}. Some sites (e.g. LinkedIn) block automated access — paste the description instead.`,
      );
    }

    const body = await readLimited(res);
    const type = res.headers.get("content-type") ?? "";
    const text = type.includes("html") ? htmlToText(body) : body.trim();

    if (text.length < 200) {
      throw new JobFetchError(
        "Couldn't read the job description from that page (it may require login or JavaScript). Paste the description instead.",
      );
    }
    return { url: url.toString(), text };
  }
  throw new JobFetchError("The job link redirected too many times.");
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new JobFetchError("Only http(s) job links are supported.");
  }
  const addresses = net.isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true }).catch(() => {
        throw new JobFetchError("Couldn't find that website. Check the link.");
      });
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw new JobFetchError("That link points to a private network address.");
  }
}

function isPrivateAddress(ip: string): boolean {
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const lower = ip.toLowerCase();
  return lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new JobFetchError("That page is too large to read. Paste the job description instead.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Prefers schema.org JobPosting JSON-LD (used by most job boards), else strips the HTML. */
export function htmlToText(html: string): string {
  const jsonLd = extractJobPostingJsonLd(html);
  if (jsonLd) return jsonLd;

  const stripped = html
    .replace(/<(script|style|noscript|svg|head|nav|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractJobPostingJsonLd(html: string): string | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    try {
      const data: unknown = JSON.parse(match[1]);
      const nodes = flatten(data);
      const posting = nodes.find((n) => {
        const t = n["@type"];
        return t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"));
      });
      if (!posting) continue;
      const org = posting.hiringOrganization as Record<string, unknown> | undefined;
      const parts = [
        posting.title && `Title: ${posting.title}`,
        org?.name && `Company: ${org.name}`,
        posting.employmentType && `Employment type: ${posting.employmentType}`,
        posting.description && htmlToText(String(posting.description)),
        posting.qualifications && `Qualifications: ${htmlToText(String(posting.qualifications))}`,
        posting.skills && `Skills: ${String(posting.skills)}`,
      ].filter(Boolean);
      const text = parts.join("\n\n");
      if (text.length > 50) return text;
    } catch {
      // malformed JSON-LD — fall through to plain HTML stripping
    }
  }
  return null;
}

function flatten(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.flatMap(flatten);
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    return [obj, ...(obj["@graph"] ? flatten(obj["@graph"]) : [])];
  }
  return [];
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", bull: "•", middot: "·" };
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return named[code.toLowerCase()] ?? m;
  });
}
