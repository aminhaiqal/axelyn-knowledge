import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_BYTES = 16;
const INITIALIZATION_VECTOR_BYTES = 12;
const VERSION = "v1";
const ADDITIONAL_DATA = Buffer.from("axelyn-knowledge:provider-credential:v1", "utf8");
const DEVELOPMENT_KEY = createHash("sha256")
  .update("axelyn-knowledge-development-credential-key")
  .digest();

export function credentialEncryptionAvailable(): boolean {
  if (process.env.CREDENTIAL_ENCRYPTION_KEY) {
    return Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY, "base64").length === 32;
  }
  return process.env.NODE_ENV !== "production";
}

function credentialEncryptionKey(): Buffer {
  const encoded = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!encoded && process.env.NODE_ENV !== "production") return DEVELOPMENT_KEY;
  if (!encoded) throw new Error("Credential encryption is not configured.");

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

export function encryptCredential(plaintext: string): string {
  const initializationVector = randomBytes(INITIALIZATION_VECTOR_BYTES);
  const cipher = createCipheriv(ALGORITHM, credentialEncryptionKey(), initializationVector, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(ADDITIONAL_DATA);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return [
    VERSION,
    initializationVector.toString("base64url"),
    authenticationTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptCredential(envelope: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, unexpected] = envelope.split(".");
  if (version !== VERSION || !encodedIv || !encodedTag || !encodedCiphertext || unexpected) {
    throw new Error("Stored credential envelope is invalid.");
  }

  const initializationVector = Buffer.from(encodedIv, "base64url");
  const authenticationTag = Buffer.from(encodedTag, "base64url");
  if (
    initializationVector.length !== INITIALIZATION_VECTOR_BYTES ||
    authenticationTag.length !== AUTH_TAG_BYTES
  ) {
    throw new Error("Stored credential envelope is invalid.");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, credentialEncryptionKey(), initializationVector, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(ADDITIONAL_DATA);
    decipher.setAuthTag(authenticationTag);
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Stored credential could not be decrypted.");
  }
}

export function credentialHint(apiKey: string): string {
  return `•••• ${apiKey.slice(-4)}`;
}
