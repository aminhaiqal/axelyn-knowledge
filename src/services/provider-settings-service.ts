import "server-only";

import { z } from "zod";
import type { PoolClient, QueryResultRow } from "pg";
import { DEFAULT_EXTRACTION_MODELS, extractionProvider } from "@/src/config";
import { query, withTransaction } from "@/src/db/pool";
import { badRequest, unavailable } from "@/src/domain/errors";
import { logger } from "@/src/lib/logger";
import {
  credentialEncryptionAvailable,
  credentialHint,
  decryptCredential,
  encryptCredential,
} from "@/src/security/credential-crypto";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const ProviderModelChainSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(
        /^[~a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._:~-]*$/i,
        "Use a valid OpenRouter model identifier.",
      ),
  )
  .min(1)
  .max(5)
  .transform((models) => [...new Set(models)]);

const ApiKeySchema = z.string().trim().min(20).max(500);

interface ProviderSettingsRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  encrypted_api_key: string;
  key_hint: string;
  key_label: string | null;
  models: unknown;
  credential_status: "VALID" | "INVALID";
  is_free_tier: boolean | null;
  limit_remaining: string | number | null;
  expires_at: Date | string | null;
  validated_at: Date | string;
  updated_at: Date | string;
}

interface OpenRouterKeyDetails {
  label: string | null;
  isFreeTier: boolean | null;
  limitRemaining: number | null;
  expiresAt: string | null;
}

export interface ProviderSettingsView {
  configured: boolean;
  credentialStatus: "VALID" | "INVALID" | "UNVERIFIED" | "MISSING";
  encryptionReady: boolean;
  keyHint: string | null;
  keyLabel: string | null;
  models: string[];
  source: "workspace" | "environment" | "none";
  isFreeTier: boolean | null;
  limitRemaining: number | null;
  expiresAt: string | null;
  validatedAt: string | null;
  updatedAt: string | null;
}

export interface ResolvedExtractionProvider {
  apiKey: string;
  models: string[];
  baseUrl: string;
}

const KeyResponseSchema = z.object({
  data: z.object({
    label: z.string().nullable().optional(),
    is_free_tier: z.boolean().nullable().optional(),
    is_management_key: z.boolean().optional(),
    is_provisioning_key: z.boolean().optional(),
    limit_remaining: z.number().nullable().optional(),
    expires_at: z.string().nullable().optional(),
  }),
});

const ModelCatalogSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      supported_parameters: z.array(z.string()).optional().default([]),
    }),
  ),
});

function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function numberOrNull(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

async function providerRow(workspaceId: string, client?: PoolClient) {
  const text = `SELECT * FROM provider_settings WHERE workspace_id = $1`;
  const result = client
    ? await client.query<ProviderSettingsRow>(text, [workspaceId])
    : await query<ProviderSettingsRow>(text, [workspaceId]);
  return result.rows[0] ?? null;
}

async function validateOpenRouterKey(apiKey: string): Promise<OpenRouterKeyDetails> {
  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw unavailable(
      "PROVIDER_UNAVAILABLE",
      "OpenRouter could not be reached. Existing settings were not changed.",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw badRequest("INVALID_PROVIDER_KEY", "OpenRouter rejected this API key.");
  }
  if (!response.ok) {
    throw unavailable(
      "PROVIDER_UNAVAILABLE",
      "OpenRouter could not validate this key. Existing settings were not changed.",
    );
  }

  const parsed = KeyResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw unavailable(
      "PROVIDER_RESPONSE_INVALID",
      "OpenRouter returned an unexpected key response. Existing settings were not changed.",
    );
  }
  if (parsed.data.data.is_management_key || parsed.data.data.is_provisioning_key) {
    throw badRequest(
      "INVALID_PROVIDER_KEY_TYPE",
      "Use a standard OpenRouter API key that can run model requests.",
    );
  }

  return {
    label: parsed.data.data.label ?? null,
    isFreeTier: parsed.data.data.is_free_tier ?? null,
    limitRemaining: parsed.data.data.limit_remaining ?? null,
    expiresAt: parsed.data.data.expires_at ?? null,
  };
}

async function validateModelChain(models: string[]): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/models?output_modalities=text`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw unavailable(
      "MODEL_CATALOG_UNAVAILABLE",
      "OpenRouter's model catalog could not be reached. Existing settings were not changed.",
    );
  }
  if (!response.ok) {
    throw unavailable(
      "MODEL_CATALOG_UNAVAILABLE",
      "OpenRouter's model catalog could not be checked. Existing settings were not changed.",
    );
  }

  const catalog = ModelCatalogSchema.safeParse(await response.json());
  if (!catalog.success) {
    throw unavailable(
      "MODEL_CATALOG_INVALID",
      "OpenRouter returned an unexpected model catalog. Existing settings were not changed.",
    );
  }

  const available = new Map(catalog.data.data.map((model) => [model.id, model]));
  for (const modelId of models) {
    const model = available.get(modelId);
    if (!model) {
      throw badRequest("MODEL_NOT_AVAILABLE", `${modelId} is not available on OpenRouter.`);
    }
    if (
      !model.supported_parameters.includes("response_format") ||
      !model.supported_parameters.includes("structured_outputs")
    ) {
      throw badRequest(
        "MODEL_NOT_COMPATIBLE",
        `${modelId} does not support the structured extraction contract.`,
      );
    }
  }
}

export class ProviderSettingsService {
  async view(workspaceId: string): Promise<ProviderSettingsView> {
    const row = await providerRow(workspaceId);
    if (row) {
      return {
        configured: true,
        credentialStatus: row.credential_status,
        encryptionReady: credentialEncryptionAvailable(),
        keyHint: row.key_hint,
        keyLabel: row.key_label,
        models: ProviderModelChainSchema.parse(row.models),
        source: "workspace",
        isFreeTier: row.is_free_tier,
        limitRemaining: numberOrNull(row.limit_remaining),
        expiresAt: iso(row.expires_at),
        validatedAt: iso(row.validated_at),
        updatedAt: iso(row.updated_at),
      };
    }

    const environment = extractionProvider();
    return {
      configured: Boolean(environment),
      credentialStatus: environment ? "UNVERIFIED" : "MISSING",
      encryptionReady: credentialEncryptionAvailable(),
      keyHint: environment ? credentialHint(environment.apiKey) : null,
      keyLabel: environment ? "Server environment" : null,
      models: environment?.models ?? [...DEFAULT_EXTRACTION_MODELS],
      source: environment ? "environment" : "none",
      isFreeTier: null,
      limitRemaining: null,
      expiresAt: null,
      validatedAt: null,
      updatedAt: null,
    };
  }

  async resolve(workspaceId: string): Promise<ResolvedExtractionProvider | null> {
    const row = await providerRow(workspaceId);
    if (!row) return extractionProvider();
    try {
      return {
        apiKey: decryptCredential(row.encrypted_api_key),
        models: ProviderModelChainSchema.parse(row.models),
        baseUrl: OPENROUTER_BASE_URL,
      };
    } catch (error) {
      logger.error("provider_settings.decrypt_failed", {
        workspace_id: workspaceId,
        message: error instanceof Error ? error.message : "Unknown credential failure",
      });
      return null;
    }
  }

  async save(
    workspaceId: string,
    input: { apiKey?: string; models: string[] },
    actor: string,
  ): Promise<void> {
    if (!credentialEncryptionAvailable()) {
      throw unavailable(
        "CREDENTIAL_ENCRYPTION_UNAVAILABLE",
        "Encrypted credential storage is not ready on this server.",
      );
    }

    const models = ProviderModelChainSchema.parse(input.models);
    const current = await providerRow(workspaceId);
    const environment = extractionProvider();
    const suppliedKey = input.apiKey?.trim();
    const apiKey = suppliedKey
      ? ApiKeySchema.parse(suppliedKey)
      : current
        ? decryptCredential(current.encrypted_api_key)
        : environment?.apiKey;
    if (!apiKey) {
      throw badRequest("PROVIDER_KEY_REQUIRED", "Enter an OpenRouter API key.");
    }

    const [details] = await Promise.all([
      validateOpenRouterKey(apiKey),
      validateModelChain(models),
    ]);
    const encryptedApiKey = encryptCredential(apiKey);
    const hint = credentialHint(apiKey);

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO workspaces (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING`,
        [workspaceId],
      );
      const saved = await client.query<{ id: string }>(
        `INSERT INTO provider_settings (
          workspace_id, encrypted_api_key, key_hint, key_label, models,
          credential_status, is_free_tier, limit_remaining, expires_at,
          validated_at, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, 'VALID', $6, $7, $8, now(), $9, $9)
        ON CONFLICT (workspace_id) DO UPDATE SET
          encrypted_api_key = EXCLUDED.encrypted_api_key,
          key_hint = EXCLUDED.key_hint,
          key_label = EXCLUDED.key_label,
          models = EXCLUDED.models,
          credential_status = 'VALID',
          is_free_tier = EXCLUDED.is_free_tier,
          limit_remaining = EXCLUDED.limit_remaining,
          expires_at = EXCLUDED.expires_at,
          validated_at = now(),
          updated_by = EXCLUDED.updated_by
        RETURNING id`,
        [
          workspaceId,
          encryptedApiKey,
          hint,
          details.label,
          JSON.stringify(models),
          details.isFreeTier,
          details.limitRemaining,
          details.expiresAt,
          actor,
        ],
      );
      await client.query(
        `INSERT INTO outbox_events (
          workspace_id, event_type, aggregate_type, aggregate_id, payload
        ) VALUES ($1, 'provider.settings.updated', 'provider_settings', $2, $3)`,
        [workspaceId, saved.rows[0].id, { provider: "openrouter", models, updated_by: actor }],
      );
    });
  }

  async test(workspaceId: string, actor: string): Promise<OpenRouterKeyDetails> {
    const row = await providerRow(workspaceId);
    const environment = extractionProvider();
    const apiKey = row ? decryptCredential(row.encrypted_api_key) : environment?.apiKey;
    if (!apiKey) throw badRequest("PROVIDER_KEY_REQUIRED", "Save an OpenRouter API key first.");

    try {
      const details = await validateOpenRouterKey(apiKey);
      if (row) {
        await query(
          `UPDATE provider_settings SET
            credential_status = 'VALID', key_label = $2, is_free_tier = $3,
            limit_remaining = $4, expires_at = $5, validated_at = now(), updated_by = $6
           WHERE id = $1`,
          [
            row.id,
            details.label,
            details.isFreeTier,
            details.limitRemaining,
            details.expiresAt,
            actor,
          ],
        );
      }
      return details;
    } catch (error) {
      if (row) {
        await query(
          `UPDATE provider_settings SET credential_status = 'INVALID', validated_at = now(), updated_by = $2
           WHERE id = $1`,
          [row.id, actor],
        );
      }
      throw error;
    }
  }

  async remove(workspaceId: string, actor: string): Promise<void> {
    await withTransaction(async (client) => {
      const current = await providerRow(workspaceId, client);
      if (!current) return;
      await client.query(`DELETE FROM provider_settings WHERE id = $1`, [current.id]);
      await client.query(
        `INSERT INTO outbox_events (
          workspace_id, event_type, aggregate_type, aggregate_id, payload
        ) VALUES ($1, 'provider.settings.removed', 'provider_settings', $2, $3)`,
        [workspaceId, current.id, { provider: "openrouter", removed_by: actor }],
      );
    });
  }
}

export const providerSettingsService = new ProviderSettingsService();
