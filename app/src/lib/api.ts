import type { Resume, TailorResult } from "./types";

// Set EXPO_PUBLIC_API_URL in app/.env (dev) or in eas.json (store builds).
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const APP_TOKEN = process.env.EXPO_PUBLIC_APP_TOKEN;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return APP_TOKEN ? { ...extra, "X-App-Token": APP_TOKEN } : extra;
}

async function handle<T>(res: Response): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Server error (${res.status}).`);
  }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error;
    throw new Error(msg ?? `Server error (${res.status}).`);
  }
  return body as T;
}

function networkError(): Error {
  return new Error("Couldn't reach the TailorMade server. Check your internet connection.");
}

export async function parseResume(file: { uri: string; name: string; mimeType?: string }): Promise<Resume> {
  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } file descriptors.
  form.append("resume", { uri: file.uri, name: file.name, type: file.mimeType ?? "application/pdf" } as unknown as Blob);
  const res = await fetch(`${API_URL}/api/resume/parse`, { method: "POST", headers: headers(), body: form }).catch(() => {
    throw networkError();
  });
  return (await handle<{ profile: Resume }>(res)).profile;
}

export interface TailorInput {
  profile: Resume;
  jobUrl?: string;
  jobText?: string;
  jobTitle?: string;
}

export async function tailor(input: TailorInput): Promise<{ result: TailorResult; jobDescription: string }> {
  const res = await fetch(`${API_URL}/api/tailor`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  }).catch(() => {
    throw networkError();
  });
  return handle(res);
}
