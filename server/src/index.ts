import Anthropic from "@anthropic-ai/sdk";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import {
  AuthError,
  createSession,
  currentUser,
  DEV_LOGIN_ENABLED,
  requireAuth,
  signInDev,
  signInWithApple,
  signInWithGoogle,
} from "./auth.js";
import { BillingError, billingConfigured, revenueCatWebhook, syncSubscription } from "./billing.js";
import { parseResumePdf, tailorResume, TailorError } from "./claude.js";
import { deleteUser, getUser, type User } from "./db.js";
import { fetchJobPosting, JobFetchError } from "./jobFetch.js";
import { PLANS, QuotaExceededError, usageSummary, withQuota } from "./limits.js";
import { TailorRequestSchema } from "./schema.js";

const PORT = Number(process.env.PORT ?? 8787);

const app = express();
app.disable("x-powered-by");
// Behind a host's load balancer, trust its X-Forwarded-For so per-IP limits see real clients.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

// Per-IP backstop on top of per-user quotas (slows down sign-in abuse and scripted accounts).
const hits = new Map<string, { count: number; reset: number }>();
const LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR ?? 60);
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.reset < now) {
    hits.set(key, { count: 1, reset: now + 3_600_000 });
    return next();
  }
  if (++entry.count > LIMIT_PER_HOUR) {
    return res.status(429).json({ error: "Too many requests. Please try again later.", code: "rate_limited" });
  }
  next();
}

const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, provider: u.provider });

async function sessionResponse(res: Response, user: User) {
  res.json({ token: await createSession(user), user: publicUser(user), usage: usageSummary(user) });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// ---- Sign-in ----

const AppleBody = z.object({ identityToken: z.string().min(1), fullName: z.string().max(200).default("") });
app.post("/api/auth/apple", rateLimit, async (req, res, next) => {
  try {
    const body = AppleBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Missing Apple identity token." });
    await sessionResponse(res, await signInWithApple(body.data.identityToken, body.data.fullName));
  } catch (err) {
    next(err);
  }
});

const GoogleBody = z.object({ idToken: z.string().min(1) });
app.post("/api/auth/google", rateLimit, async (req, res, next) => {
  try {
    const body = GoogleBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Missing Google ID token." });
    await sessionResponse(res, await signInWithGoogle(body.data.idToken));
  } catch (err) {
    next(err);
  }
});

if (DEV_LOGIN_ENABLED) {
  console.warn("ALLOW_DEV_LOGIN is on: anyone can sign in with any email. Never enable this in production.");
  app.post("/api/auth/dev", async (req, res, next) => {
    try {
      const email = z.string().email().safeParse(req.body?.email);
      if (!email.success) return res.status(400).json({ error: "Enter an email." });
      await sessionResponse(res, signInDev(email.data));
    } catch (err) {
      next(err);
    }
  });
}

// ---- Account ----

app.get("/api/me", requireAuth, (_req, res) => {
  const user = currentUser(res);
  res.json({ user: publicUser(user), usage: usageSummary(user) });
});

// Required by Apple (App Store guideline 5.1.1(v)): users must be able to delete their account in the app.
app.delete("/api/me", requireAuth, (_req, res) => {
  deleteUser(currentUser(res).id);
  res.json({ ok: true });
});

// ---- Subscriptions (RevenueCat) ----

// Public: lets the app's upgrade screen show the real limits for each plan.
app.get("/api/plans", (_req, res) => {
  res.json({ plans: PLANS });
});

app.post("/api/billing/revenuecat-webhook", revenueCatWebhook);

// Called by the app right after a purchase or restore, so Pro unlocks without waiting for the webhook.
app.post("/api/billing/sync", requireAuth, rateLimit, async (_req, res, next) => {
  try {
    const user = currentUser(res);
    if (billingConfigured()) await syncSubscription(user.id);
    res.json({ usage: usageSummary(getUser(user.id)!) });
  } catch (err) {
    next(err);
  }
});

// ---- Resume features (signed-in, metered) ----

app.post("/api/resume/parse", requireAuth, rateLimit, upload.single("resume"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Attach your resume PDF as 'resume'." });
    if (file.mimetype !== "application/pdf" && !file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return res.status(400).json({ error: "Please upload a PDF file." });
    }
    const user = currentUser(res);
    const profile = await withQuota(user, "parse", () => parseResumePdf(file.buffer));
    res.json({ profile, usage: usageSummary(user) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/tailor", requireAuth, rateLimit, async (req, res, next) => {
  try {
    const parsed = TailorRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
    }
    const { profile, jobUrl, jobText, jobTitle } = parsed.data;
    const user = currentUser(res);

    // The job fetch happens inside the quota so a bad link doesn't use up a credit (failures are refunded).
    const out = await withQuota(user, "tailor", async () => {
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
      return { result, jobDescription: description ?? "" };
    });
    res.json({ ...out, usage: usageSummary(user) });
  } catch (err) {
    next(err);
  }
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof QuotaExceededError) {
    return res.status(429).json({ error: err.message, code: "quota_exceeded", kind: err.kind, resetsAt: err.resetsAt });
  }
  if (err instanceof AuthError) return res.status(401).json({ error: err.message, code: "auth_failed" });
  if (err instanceof BillingError) {
    console.error("Billing:", err.message);
    return res.status(502).json({ error: "Couldn't check your subscription right now. Please try again." });
  }
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
