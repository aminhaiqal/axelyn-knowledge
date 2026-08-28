import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_EXTRACTION_MODELS } from "@/src/config";
import { query } from "@/src/db/pool";
import { ProviderSettingsService } from "@/src/services/provider-settings-service";

const apiKey = "sk-or-v1-integration-provider-key-123456789";
const originalEncryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
const originalExtractionKey = process.env.EXTRACTION_API_KEY;
const service = new ProviderSettingsService();

function openRouterFetch(input: string | URL | Request) {
  const url = String(input);
  if (url.endsWith("/key")) {
    return Promise.resolve(
      Response.json({
        data: {
          label: "Axelyn integration",
          is_free_tier: false,
          is_management_key: false,
          is_provisioning_key: false,
          limit_remaining: 24.75,
          expires_at: "2027-01-01T00:00:00.000Z",
        },
      }),
    );
  }
  if (url.includes("/models?")) {
    return Promise.resolve(
      Response.json({
        data: DEFAULT_EXTRACTION_MODELS.map((id) => ({
          id,
          supported_parameters: ["response_format", "structured_outputs"],
        })),
      }),
    );
  }
  return Promise.resolve(new Response(null, { status: 404 }));
}

describe("workspace provider settings", () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 13).toString("base64");
    delete process.env.EXTRACTION_API_KEY;
    vi.stubGlobal("fetch", vi.fn(openRouterFetch));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalEncryptionKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = originalEncryptionKey;
    if (originalExtractionKey === undefined) delete process.env.EXTRACTION_API_KEY;
    else process.env.EXTRACTION_API_KEY = originalExtractionKey;
  });

  it("validates, encrypts, resolves, tests, and removes a workspace key", async () => {
    await service.save(
      "settings-test",
      { apiKey, models: [...DEFAULT_EXTRACTION_MODELS] },
      "operator@example.com",
    );

    const stored = await query<{
      encrypted_api_key: string;
      key_hint: string;
      credential_status: string;
    }>(
      `SELECT encrypted_api_key, key_hint, credential_status
       FROM provider_settings WHERE workspace_id = $1`,
      ["settings-test"],
    );
    expect(stored.rows[0].encrypted_api_key).not.toContain(apiKey);
    expect(stored.rows[0].key_hint).toBe("•••• 6789");
    expect(stored.rows[0].credential_status).toBe("VALID");

    const view = await service.view("settings-test");
    expect(view).toMatchObject({
      configured: true,
      credentialStatus: "VALID",
      keyHint: "•••• 6789",
      keyLabel: "Axelyn integration",
      limitRemaining: 24.75,
      source: "workspace",
    });
    expect(JSON.stringify(view)).not.toContain(apiKey);

    await expect(service.resolve("settings-test")).resolves.toMatchObject({
      apiKey,
      models: [...DEFAULT_EXTRACTION_MODELS],
    });
    await expect(service.test("settings-test", "operator@example.com")).resolves.toMatchObject({
      limitRemaining: 24.75,
    });

    await service.remove("settings-test", "operator@example.com");
    await expect(service.resolve("settings-test")).resolves.toBeNull();
    expect(
      (
        await query<{ count: number }>(
          `SELECT count(*)::int AS count FROM provider_settings WHERE workspace_id = $1`,
          ["settings-test"],
        )
      ).rows[0].count,
    ).toBe(0);
  });
});
