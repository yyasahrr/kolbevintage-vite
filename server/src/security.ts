import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

/** scrypt password hashing ("scrypt$salt$hash") */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function newOtp(): string {
  return String(randomInt(100000, 1000000));
}
