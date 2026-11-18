import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

// SQLite file on the server. On container hosts, mount a persistent volume at this path.
const DB_PATH = process.env.DB_PATH ?? "./data/tailormade.db";
if (DB_PATH !== ":memory:") mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    provider     TEXT NOT NULL,
    provider_sub TEXT NOT NULL,
    email        TEXT NOT NULL DEFAULT '',
    name         TEXT NOT NULL DEFAULT '',
    plan         TEXT NOT NULL DEFAULT 'free',
    created_at   INTEGER NOT NULL,
    UNIQUE (provider, provider_sub)
  );
  CREATE TABLE IF NOT EXISTS usage (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS usage_user_kind_time ON usage (user_id, kind, created_at);
`);

// A crash mid-request can leave 'pending' rows; don't let them count against users forever.
db.prepare("DELETE FROM usage WHERE status = 'pending' AND created_at < ?").run(Date.now() - 15 * 60_000);

export type Provider = "apple" | "google" | "dev";

export interface User {
  id: string;
  provider: Provider;
  email: string;
  name: string;
  plan: string;
  createdAt: number;
}

interface UserRow {
  id: string;
  provider: Provider;
  email: string;
  name: string;
  plan: string;
  created_at: number;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  provider: r.provider,
  email: r.email,
  name: r.name,
  plan: r.plan,
  createdAt: r.created_at,
});

export function upsertUser(provider: Provider, sub: string, email: string, name: string): User {
  const existing = db
    .prepare("SELECT * FROM users WHERE provider = ? AND provider_sub = ?")
    .get(provider, sub) as UserRow | undefined;
  if (existing) {
    // Apple only sends email/name the first time, so never overwrite with blanks.
    db.prepare(
      "UPDATE users SET email = CASE WHEN ? <> '' THEN ? ELSE email END, name = CASE WHEN ? <> '' THEN ? ELSE name END WHERE id = ?",
    ).run(email, email, name, name, existing.id);
    return getUser(existing.id)!;
  }
  const id = randomUUID();
  db.prepare(
    "INSERT INTO users (id, provider, provider_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, provider, sub, email, name, Date.now());
  return getUser(id)!;
}

export function getUser(id: string): User | undefined {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row && toUser(row);
}

export function deleteUser(id: string): void {
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function setPlanByEmail(email: string, plan: string): number {
  return Number(db.prepare("UPDATE users SET plan = ? WHERE lower(email) = lower(?)").run(plan, email).changes);
}

export function countUsage(userId: string, kind: string, since: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM usage WHERE user_id = ? AND kind = ? AND created_at >= ?")
    .get(userId, kind, since) as { n: number };
  return Number(row.n);
}

/**
 * Atomically checks the limit and records a pending use. Returns the usage row id,
 * or null if the user is out of quota. Pending rows count toward the limit so
 * parallel requests can't overshoot it.
 */
export function reserveUsage(userId: string, kind: string, limit: number, since: number): number | null {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (countUsage(userId, kind, since) >= limit) {
      db.exec("ROLLBACK");
      return null;
    }
    const res = db
      .prepare("INSERT INTO usage (user_id, kind, created_at) VALUES (?, ?, ?)")
      .run(userId, kind, Date.now());
    db.exec("COMMIT");
    return Number(res.lastInsertRowid);
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function commitUsage(id: number): void {
  db.prepare("UPDATE usage SET status = 'done' WHERE id = ?").run(id);
}

/** Failed requests don't count against the user. */
export function releaseUsage(id: number): void {
  db.prepare("DELETE FROM usage WHERE id = ?").run(id);
}
