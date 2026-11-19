import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { getUser, upsertUser, type User } from "./db.js";

const isProd = process.env.NODE_ENV === "production";

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// The iOS bundle ID (the audience of Apple identity tokens).
const APPLE_AUDIENCES = list(process.env.APPLE_BUNDLE_IDS);
// Google OAuth client IDs: the Web client ID (what the app passes as webClientId) and optionally the iOS one.
const GOOGLE_AUDIENCES = list(process.env.GOOGLE_CLIENT_IDS);
// Test sign-in (any email) for sideloaded test builds:
// - local development: ALLOW_DEV_LOGIN=1 (never active when NODE_ENV=production)
// - a deployed server: TEST_ACCESS_CODE=<secret, 12+ chars>; the app must send the same code
const TEST_ACCESS_CODE = process.env.TEST_ACCESS_CODE ?? "";
if (TEST_ACCESS_CODE && TEST_ACCESS_CODE.length < 12) throw new Error("TEST_ACCESS_CODE must be at least 12 characters.");
const OPEN_DEV_LOGIN = process.env.ALLOW_DEV_LOGIN === "1" && !isProd;
export const DEV_LOGIN_ENABLED = OPEN_DEV_LOGIN || TEST_ACCESS_CODE !== "";

const SESSION_DAYS = 30;
const sessionSecret = (() => {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return new TextEncoder().encode(s);
  if (isProd) throw new Error("SESSION_SECRET must be set (at least 32 characters) in production.");
  console.warn("SESSION_SECRET not set — using a random one; sessions reset on restart.");
  return randomBytes(32);
})();

const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export class AuthError extends Error {}

export async function signInWithApple(identityToken: string, fullName: string): Promise<User> {
  if (!APPLE_AUDIENCES.length) throw new AuthError("Sign in with Apple isn't configured on the server.");
  const { payload } = await jwtVerify(identityToken, appleJwks, {
    issuer: "https://appleid.apple.com",
    audience: APPLE_AUDIENCES,
  }).catch(() => {
    throw new AuthError("Apple sign-in couldn't be verified. Please try again.");
  });
  if (!payload.sub) throw new AuthError("Apple sign-in returned no user.");
  const email = typeof payload.email === "string" ? payload.email : "";
  return upsertUser("apple", payload.sub, email, fullName.slice(0, 200));
}

export async function signInWithGoogle(idToken: string): Promise<User> {
  if (!GOOGLE_AUDIENCES.length) throw new AuthError("Google sign-in isn't configured on the server.");
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: GOOGLE_AUDIENCES,
  }).catch(() => {
    throw new AuthError("Google sign-in couldn't be verified. Please try again.");
  });
  if (!payload.sub) throw new AuthError("Google sign-in returned no user.");
  if (payload.email_verified === false) throw new AuthError("Please verify your Google email first.");
  const email = typeof payload.email === "string" ? payload.email : "";
  const name = typeof payload.name === "string" ? payload.name : "";
  return upsertUser("google", payload.sub, email, name);
}

/** Local testing only (Expo Go can't run Google sign-in). Disabled when NODE_ENV=production. */
function codeMatches(code: string): boolean {
  const a = Buffer.from(code);
  const b = Buffer.from(TEST_ACCESS_CODE);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signInDev(email: string, code = ""): User {
  if (!DEV_LOGIN_ENABLED) throw new AuthError("Test sign-in is turned off on this server.");
  if (TEST_ACCESS_CODE && !codeMatches(code)) throw new AuthError("Wrong access code.");
  return upsertUser("dev", email.toLowerCase(), email, "Dev User");
}

export async function createSession(user: User): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionSecret);
}

/** Express middleware: requires `Authorization: Bearer <session>` and puts the user on res.locals.user. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Please sign in.", code: "unauthenticated" });
  try {
    const { payload } = await jwtVerify(token, sessionSecret, { algorithms: ["HS256"] });
    const user = payload.sub ? getUser(payload.sub) : undefined;
    if (!user) throw new Error("user not found");
    res.locals.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Your session expired. Please sign in again.", code: "unauthenticated" });
  }
}

export const currentUser = (res: Response): User => res.locals.user as User;
