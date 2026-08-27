import { createHash } from "node:crypto";

export function normalizeStatement(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\p{L}\p{N}\s'"-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function statementHash(value: string): string {
  return sha256(normalizeStatement(value));
}
