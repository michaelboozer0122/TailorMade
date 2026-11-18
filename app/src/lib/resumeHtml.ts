import type { Resume } from "./types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const dates = (start: string, end: string) => [start, end].filter(Boolean).map(esc).join(" – ");

const list = (items: string[]) =>
  items.length ? `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : "";

/** Clean, single-column, ATS-friendly resume HTML used for PDF export. */
export function resumeToHtml(r: Resume): string {
  const contact = [r.contact.email, r.contact.phone, r.contact.location, ...r.contact.links]
    .filter(Boolean)
    .map(esc)
    .join(" · ");

  const section = (title: string, body: string) => (body ? `<h2>${title}</h2>${body}` : "");

  const experience = r.experience
    .map(
      (e) => `<div class="item">
        <div class="row"><strong>${esc(e.title)}</strong><span>${dates(e.start, e.end)}</span></div>
        <div class="sub">${[e.company, e.location].filter(Boolean).map(esc).join(", ")}</div>
        ${list(e.bullets)}
      </div>`,
    )
    .join("");

  const education = r.education
    .map(
      (e) => `<div class="item">
        <div class="row"><strong>${esc(e.school)}</strong><span>${dates(e.start, e.end)}</span></div>
        <div class="sub">${[e.degree, e.field].filter(Boolean).map(esc).join(", ")}</div>
        ${list(e.details)}
      </div>`,
    )
    .join("");

  const projects = r.projects
    .map(
      (p) => `<div class="item"><strong>${esc(p.name)}</strong>${p.description ? ` — ${esc(p.description)}` : ""}${list(p.bullets)}</div>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page { margin: 0.6in; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #111; font-size: 10.5pt; line-height: 1.35; }
  h1 { font-size: 20pt; margin: 0; }
  .headline { font-size: 11.5pt; color: #333; margin-top: 2px; }
  .contact { font-size: 9.5pt; color: #444; margin: 4px 0 8px; }
  h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid #999; padding-bottom: 2px; margin: 14px 0 6px; }
  .item { margin-bottom: 8px; page-break-inside: avoid; }
  .row { display: flex; justify-content: space-between; }
  .row span { color: #444; white-space: nowrap; margin-left: 12px; }
  .sub { color: #333; font-style: italic; }
  ul { margin: 3px 0 0 0; padding-left: 18px; }
  li { margin-bottom: 2px; }
  p { margin: 0; }
</style></head><body>
  <h1>${esc(r.name)}</h1>
  ${r.headline ? `<div class="headline">${esc(r.headline)}</div>` : ""}
  ${contact ? `<div class="contact">${contact}</div>` : ""}
  ${section("Summary", r.summary ? `<p>${esc(r.summary)}</p>` : "")}
  ${section("Skills", r.skills.length ? `<p>${r.skills.map(esc).join(" · ")}</p>` : "")}
  ${section("Experience", experience)}
  ${section("Projects", projects)}
  ${section("Education", education)}
  ${section("Certifications", list(r.certifications))}
</body></html>`;
}

export function coverLetterToHtml(letter: string, name: string): string {
  const paras = letter
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    @page { margin: 1in; }
    body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #111; }
    p { margin: 0 0 12px; }
  </style></head><body><h3>${esc(name)}</h3>${paras}</body></html>`;
}
