import { afterEach, describe, expect, it } from "vitest";
import {
  credentialEncryptionAvailable,
  credentialHint,
  decryptCredential,
  encryptCredential,
} from "@/src/security/credential-crypto";

const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;

describe("provider credential encryption", () => {
  afterEach(() => {
    if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
  });

  it("round-trips a credential through an authenticated encrypted envelope", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const plaintext = "sk-or-v1-this-is-a-test-provider-key";
    const encrypted = encryptCredential(plaintext);

    expect(credentialEncryptionAvailable()).toBe(true);
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptCredential(encrypted)).toBe(plaintext);
    expect(credentialHint(plaintext)).toBe("•••• -key");
  });

  it("rejects a modified authentication tag", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
    const encrypted = encryptCredential("sk-or-v1-another-test-provider-key");
    const parts = encrypted.split(".");
    parts[2] = Buffer.alloc(16, 1).toString("base64url");

    expect(() => decryptCredential(parts.join("."))).toThrow(
      "Stored credential could not be decrypted.",
    );
  });
});
