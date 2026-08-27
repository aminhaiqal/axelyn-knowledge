import { createHash, timingSafeEqual } from "node:crypto";
import { serviceCredentials } from "@/src/config";
import { forbidden, unauthorized } from "@/src/domain/errors";

export interface ServiceIdentity {
  kind: "service";
  id: string;
  workspaces: string[];
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function authenticateBearer(
  authorization: string | null,
  credentials = serviceCredentials(),
): ServiceIdentity {
  if (!authorization?.startsWith("Bearer ")) throw unauthorized();
  const supplied = authorization.slice(7);
  if (!supplied) throw unauthorized();
  const suppliedDigest = digest(supplied);
  let match: ServiceIdentity | null = null;
  for (const credential of credentials) {
    const equal = timingSafeEqual(suppliedDigest, digest(credential.secret));
    if (equal) match = { kind: "service", id: credential.id, workspaces: credential.workspaces };
  }
  if (!match) throw unauthorized();
  return match;
}

export function authenticateServiceRequest(request: Request) {
  return authenticateBearer(request.headers.get("authorization"));
}

export function authorizeWorkspace(identity: ServiceIdentity, workspaceId: string) {
  if (!identity.workspaces.includes(workspaceId)) throw forbidden();
}
