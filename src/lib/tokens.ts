import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** 256-bit random token for cookies and sign-in links. */
export const newToken = () => randomBytes(32).toString("base64url");

/** Tokens are stored hashed so a database leak can't be replayed as sessions or links. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const ADDRESS_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i confusion
export const UPLOAD_TOKEN_LENGTH = 12;

/** Local part for a user's upload address; ~59 bits, typed rarely so kept readable. */
export function newUploadToken() {
  let s = "";
  for (let i = 0; i < UPLOAD_TOKEN_LENGTH; i++) s += ADDRESS_ALPHABET[randomInt(ADDRESS_ALPHABET.length)];
  return s;
}

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
