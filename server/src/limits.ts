import { commitUsage, countUsage, releaseUsage, reserveUsage, type User } from "./db.js";

export type UsageKind = "tailor" | "parse";

interface PlanLimits {
  tailorPerMonth: number;
  parsePerDay: number;
}

const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);

// Change limits with env vars; no redeploy of the app needed.
export const PLANS: Record<string, PlanLimits> = {
  free: {
    tailorPerMonth: num(process.env.FREE_TAILORS_PER_MONTH, 10),
    parsePerDay: num(process.env.FREE_PARSES_PER_DAY, 5),
  },
  pro: {
    tailorPerMonth: num(process.env.PRO_TAILORS_PER_MONTH, 200),
    parsePerDay: num(process.env.PRO_PARSES_PER_DAY, 20),
  },
};

const limitsFor = (user: User) => PLANS[user.plan] ?? PLANS.free;

/** Calendar windows in UTC: tailoring resets monthly, resume uploads daily. */
function windowFor(kind: UsageKind, now = new Date()): { start: number; resetsAt: number } {
  if (kind === "tailor") {
    return {
      start: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      resetsAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    };
  }
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { start, resetsAt: start + 86_400_000 };
}

function limitOf(user: User, kind: UsageKind): number {
  const l = limitsFor(user);
  return kind === "tailor" ? l.tailorPerMonth : l.parsePerDay;
}

export class QuotaExceededError extends Error {
  constructor(
    readonly kind: UsageKind,
    readonly resetsAt: number,
  ) {
    super(
      kind === "tailor"
        ? `You've used all your tailored resumes for this month. More on ${new Date(resetsAt).toUTCString().slice(0, 16)}.`
        : "You've reached today's resume upload limit. Try again tomorrow.",
    );
  }
}

/** Runs `fn` only if the user has quota left; the use is counted only if `fn` succeeds. */
export async function withQuota<T>(user: User, kind: UsageKind, fn: () => Promise<T>): Promise<T> {
  const { start, resetsAt } = windowFor(kind);
  const id = reserveUsage(user.id, kind, limitOf(user, kind), start);
  if (id === null) throw new QuotaExceededError(kind, resetsAt);
  try {
    const result = await fn();
    commitUsage(id);
    return result;
  } catch (err) {
    releaseUsage(id);
    throw err;
  }
}

export function usageSummary(user: User) {
  const summarize = (kind: UsageKind) => {
    const { start, resetsAt } = windowFor(kind);
    const limit = limitOf(user, kind);
    const used = countUsage(user.id, kind, start);
    return { used, limit, remaining: Math.max(0, limit - used), resetsAt };
  };
  return {
    plan: user.plan,
    subscription: { active: user.subscription.active, expiresAt: user.subscription.expiresAt },
    tailor: summarize("tailor"),
    parse: summarize("parse"),
  };
}
