import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { getUser, setSubscription, type Subscription } from "./db.js";

// RevenueCat handles App Store / Google Play billing. Our user ID is the RevenueCat app_user_id,
// so we always ask RevenueCat for the truth instead of trusting the app or webhook payloads.
const SECRET_KEY = process.env.REVENUECAT_SECRET_KEY ?? "";
const WEBHOOK_AUTH = process.env.REVENUECAT_WEBHOOK_AUTH ?? "";
const ENTITLEMENT = process.env.REVENUECAT_ENTITLEMENT ?? "pro";
const API_BASE = (process.env.REVENUECAT_API_BASE ?? "https://api.revenuecat.com").replace(/\/$/, "");

export const billingConfigured = () => SECRET_KEY !== "";

export class BillingError extends Error {}

interface RevenueCatEntitlement {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string;
}

/** Reads the user's current entitlement from RevenueCat's REST API. */
export async function fetchSubscription(appUserId: string): Promise<Subscription> {
  if (!billingConfigured()) throw new BillingError("Subscriptions aren't configured on the server.");
  const res = await fetch(`${API_BASE}/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${SECRET_KEY}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new BillingError(`RevenueCat responded with ${res.status}.`);
  const body = (await res.json()) as {
    subscriber?: { entitlements?: Record<string, RevenueCatEntitlement> };
  };
  const ent = body.subscriber?.entitlements?.[ENTITLEMENT];
  if (!ent) return { active: false, expiresAt: null, product: "" };

  const dates = [ent.expires_date, ent.grace_period_expires_date]
    .filter((d): d is string => !!d)
    .map((d) => Date.parse(d))
    .filter(Number.isFinite);
  // expires_date null means a non-expiring (lifetime) purchase.
  const expiresAt = ent.expires_date === null ? null : dates.length ? Math.max(...dates) : 0;
  const active = expiresAt === null || expiresAt > Date.now();
  return { active, expiresAt, product: ent.product_identifier ?? "" };
}

/** Refreshes one user's subscription from RevenueCat. Unknown IDs (e.g. RevenueCat anonymous IDs) are ignored. */
export async function syncSubscription(userId: string): Promise<boolean> {
  if (!getUser(userId)) return false;
  setSubscription(userId, await fetchSubscription(userId));
  return true;
}

function authorized(header: string): boolean {
  if (!WEBHOOK_AUTH) return false;
  const candidates = [WEBHOOK_AUTH, `Bearer ${WEBHOOK_AUTH}`];
  const got = Buffer.from(header);
  return candidates.some((c) => {
    const want = Buffer.from(c);
    return want.length === got.length && timingSafeEqual(want, got);
  });
}

interface WebhookEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
}

/**
 * RevenueCat webhook (Project settings → Integrations → Webhooks). Set its Authorization header
 * to REVENUECAT_WEBHOOK_AUTH. Any event just triggers a re-sync of the users it mentions.
 */
export async function revenueCatWebhook(req: Request, res: Response) {
  if (!authorized(req.get("authorization") ?? "")) return res.status(401).json({ error: "Unauthorized" });
  const event = (req.body?.event ?? {}) as WebhookEvent;
  if (event.type === "TEST") return res.json({ ok: true });

  const ids = new Set(
    [
      event.app_user_id,
      event.original_app_user_id,
      ...(event.aliases ?? []),
      ...(event.transferred_from ?? []),
      ...(event.transferred_to ?? []),
    ].filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 200),
  );

  try {
    let synced = 0;
    for (const id of ids) if (await syncSubscription(id)) synced++;
    res.json({ ok: true, synced });
  } catch (err) {
    // A non-2xx response makes RevenueCat retry the webhook later.
    console.error("RevenueCat webhook sync failed:", err);
    res.status(502).json({ error: "Sync failed" });
  }
}
