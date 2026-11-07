import { createHash, randomUUID } from "node:crypto";

export function newId(prefix: "gen" | "ast"): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
