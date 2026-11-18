import Anthropic from "@anthropic-ai/sdk";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { parseResumePdf, tailorResume, TailorError } from "./claude.js";
import { fetchJobPosting, JobFetchError } from "./jobFetch.js";
import { TailorRequestSchema } from "./schema.js";

const PORT = Number(process.env.PORT ?? 8787);
const APP_TOKEN = process.env.APP_TOKEN; // optional shared token the app sends as X-App-Token

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

// Very small per-IP rate limiter so a leaked URL can't run up your API bill.
const hits = new Map<string, { count: number; reset: number }>();
const LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR ?? 30);
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.reset < now) {
    hits.set(key, { count: 1, reset: now + 3_600_000 });
    return next();
  }
  if (++entry.count > LIMIT_PER_HOUR) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }
  next();
}

function requireToken(req: Request, res: Response, next: NextFunction) {
  if (APP_TOKEN && req.get("x-app-token") !== APP_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/resume/parse", requireToken, rateLimit, upload.single("resume"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Attach your resume PDF as 'resume'." });
    if (file.mimetype !== "application/pdf" && !file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return res.status(400).json({ error: "Please upload a PDF file." });
    }
    const profile = await parseResumePdf(file.buffer);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

app.post("/api/tailor", requireToken, rateLimit, async (req, res, next) => {
  try {
    const parsed = TailorRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
    }
    const { profile, jobUrl, jobText, jobTitle } = parsed.data;

    let description = jobText?.trim() || undefined;
    let sourceUrl: string | undefined;
    if (!description && jobUrl) {
      const fetched = await fetchJobPosting(jobUrl);
      description = fetched.text;
      sourceUrl = fetched.url;
    }

    const result = await tailorResume(profile, {
      description,
      title: jobTitle?.trim() || undefined,
      sourceUrl,
    });
    res.json({ result, jobDescription: description ?? "" });
  } catch (err) {
    next(err);
  }
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof JobFetchError) return res.status(422).json({ error: err.message });
  if (err instanceof TailorError) return res.status(err.status).json({ error: err.message });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: "PDF must be under 10 MB." });
  if (err instanceof Anthropic.RateLimitError) {
    return res.status(503).json({ error: "The service is busy. Please try again in a minute." });
  }
  if (err instanceof Anthropic.BadRequestError) {
    console.error("Anthropic bad request:", err.message);
    return res.status(400).json({ error: "That file or text couldn't be processed. Is the PDF readable?" });
  }
  if (err instanceof Anthropic.APIError) {
    console.error(`Anthropic API error ${err.status}:`, err.message);
    return res.status(502).json({ error: "The AI service had a problem. Please try again." });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong." });
});

app.listen(PORT, () => {
  console.log(`TailorMade API listening on :${PORT}`);
});
