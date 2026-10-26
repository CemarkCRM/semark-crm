import type { Request, Response, NextFunction } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SafeUser } from "@shared/schema";
import { isImportExportAllowed, MANAGER_ROLES } from "@shared/access";

// Signing secret. In production AUTH_SECRET is required: without it every
// restart would silently log everyone out, and a known value lets anyone forge tokens.
const EXAMPLE_SECRET = "zaminit-na-svii-dovhyi-vypadkovyi-riadok";
if (process.env.NODE_ENV === "production") {
  const s = process.env.AUTH_SECRET;
  if (!s || s === EXAMPLE_SECRET || s.length < 32) {
    console.error("AUTH_SECRET не задано або він надто простий (потрібно щонайменше 32 символи). Сервер зупинено.");
    process.exit(1);
  }
}
const SECRET = process.env.AUTH_SECRET || randomBytes(32).toString("hex");

const TOKEN_TTL_MS = 10 * 60 * 60 * 1000; // 10 hours

export type TokenPayload = {
  id: number;
  role: string;
  fullName: string;
  iat: number; // issued-at (ms epoch)
  exp: number; // expires-at (ms epoch)
};

// Stateless tokens, but support an in-memory denylist so logout can invalidate
// a token before it naturally expires. Cleared on process restart.
const denylist = new Map<string, number>(); // token -> exp (ms)

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

// JWT-like compact token: base64url(header).base64url(payload).signature
export function createToken(user: Pick<SafeUser, "id" | "role" | "fullName">): { token: string; payload: TokenPayload } {
  const now = Date.now();
  const payload: TokenPayload = {
    id: user.id,
    role: user.role,
    fullName: user.fullName,
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = sign(`${header}.${body}`);
  return { token: `${header}.${body}.${signature}`, payload };
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = sign(`${header}.${body}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
  if (denylist.has(token)) return null;
  return payload;
}

export function revokeToken(token: string) {
  const payload = verifyToken(token);
  if (payload) denylist.set(token, payload.exp);
  // Opportunistic cleanup of expired denylist entries.
  const now = Date.now();
  Array.from(denylist.entries()).forEach(([t, exp]) => {
    if (exp < now) denylist.delete(t);
  });
}

declare module "express-serve-static-core" {
  interface Request {
    user?: TokenPayload;
  }
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: "Потрібна автентифікація" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Недійсний або прострочений токен" });
  req.user = payload;
  next();
}

export function requireManager(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Потрібна автентифікація" });
  if (!MANAGER_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: "Недостатньо прав" });
  }
  next();
}

export function requireImportExportAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Потрібна автентифікація" });
  if (!isImportExportAllowed(req.user.role)) {
    return res.status(403).json({ error: "Імпорт/експорт дозволено лише уповноваженим користувачам" });
  }
  next();
}
