import { ApiError } from "./api";

export const formatReset = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export const isQuotaError = (e: unknown): e is ApiError => e instanceof ApiError && e.code === "quota_exceeded";
