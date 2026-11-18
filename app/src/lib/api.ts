import type { AccountUser, Resume, TailorResult, Usage } from "./types";

// Set EXPO_PUBLIC_API_URL in app/.env.local (dev) or in eas.json (store builds).
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, "");

let sessionToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;

export function setSessionToken(token: string | null) {
  sessionToken = token;
}

/** Called when the server says the session is invalid (expired or account deleted). */
export function setUnauthenticatedHandler(fn: (() => void) | null) {
  onUnauthenticated = fn;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Couldn't reach the TailorMade server. Check your internet connection.", 0);
  }

  let body: { error?: string; code?: string } & Record<string, unknown>;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(`Server error (${res.status}).`, res.status);
  }
  if (!res.ok) {
    if (res.status === 401 && body.code === "unauthenticated") onUnauthenticated?.();
    throw new ApiError(body.error ?? `Server error (${res.status}).`, res.status, body.code);
  }
  return body as T;
}

export interface SessionResponse {
  token: string;
  user: AccountUser;
  usage: Usage;
}

export const signInWithAppleToken = (identityToken: string, fullName: string) =>
  request<SessionResponse>("/api/auth/apple", { method: "POST", body: JSON.stringify({ identityToken, fullName }) });

export const signInWithGoogleToken = (idToken: string) =>
  request<SessionResponse>("/api/auth/google", { method: "POST", body: JSON.stringify({ idToken }) });

export const signInDev = (email: string) =>
  request<SessionResponse>("/api/auth/dev", { method: "POST", body: JSON.stringify({ email }) });

export const getMe = () => request<{ user: AccountUser; usage: Usage }>("/api/me");

export const deleteAccount = () => request<{ ok: true }>("/api/me", { method: "DELETE" });

export async function parseResume(file: {
  uri: string;
  name: string;
  mimeType?: string;
}): Promise<{ profile: Resume; usage: Usage }> {
  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } file descriptors.
  form.append("resume", { uri: file.uri, name: file.name, type: file.mimeType ?? "application/pdf" } as unknown as Blob);
  return request("/api/resume/parse", { method: "POST", body: form });
}

export interface TailorInput {
  profile: Resume;
  jobUrl?: string;
  jobText?: string;
  jobTitle?: string;
}

export const tailor = (input: TailorInput) =>
  request<{ result: TailorResult; jobDescription: string; usage: Usage }>("/api/tailor", {
    method: "POST",
    body: JSON.stringify(input),
  });
