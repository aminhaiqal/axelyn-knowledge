import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiRoute, parseJson } from "@/src/api/http";
import { authenticateBearer } from "@/src/auth/service-auth";
import { operatorFromHeaders } from "@/src/auth/operator-auth";

const secret = "local-test-secret-that-is-longer-than-thirty-two-characters";
afterEach(() => {
  delete process.env.SERVICE_TOKENS;
  delete process.env.ALLOW_DEV_OPERATOR;
  delete process.env.DEV_OPERATOR_EMAIL;
  vi.unstubAllEnvs();
});

describe("authentication", () => {
  it("accepts a matching bearer token and retains its workspace ceiling", () => {
    const identity = authenticateBearer(`Bearer ${secret}`, [
      { id: "signal", secret, workspaces: ["axelyn"] },
    ]);
    expect(identity).toEqual({ kind: "service", id: "signal", workspaces: ["axelyn"] });
  });

  it("returns the same generic API failure for absent and invalid tokens", async () => {
    process.env.SERVICE_TOKENS = JSON.stringify([{ id: "signal", secret, workspaces: ["axelyn"] }]);
    const missing = await apiRoute(new Request("http://localhost/api"), async () =>
      Response.json({ ok: true }),
    );
    const invalid = await apiRoute(
      new Request("http://localhost/api", { headers: { authorization: "Bearer invalid" } }),
      async () => Response.json({ ok: true }),
    );
    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    const missingBody = (await missing.json()) as { error: unknown };
    const invalidBody = (await invalid.json()) as { error: unknown };
    expect(missingBody.error).toEqual(invalidBody.error);
  });

  it("allows explicit development operator identity outside production", () => {
    process.env.ALLOW_DEV_OPERATOR = "true";
    process.env.DEV_OPERATOR_EMAIL = "operator@localhost";
    expect(operatorFromHeaders(new Headers()).email).toBe("operator@localhost");
  });

  it("hard-disables development operator identity in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ALLOW_DEV_OPERATOR = "true";
    process.env.DEV_OPERATOR_EMAIL = "operator@localhost";
    expect(() => operatorFromHeaders(new Headers())).toThrowError(
      expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" }),
    );
  });

  it("stops reading JSON bodies at the configured byte ceiling", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(100) }),
    });
    await expect(parseJson(request, z.object({ value: z.string() }), 32)).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      status: 413,
    });
  });
});
