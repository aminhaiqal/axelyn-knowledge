import { headers } from "next/headers";
import { unauthorized as interruptUnauthorized } from "next/navigation";
import { AppError, unauthorized } from "@/src/domain/errors";

export interface OperatorIdentity {
  kind: "operator";
  email: string;
}

export function operatorFromHeaders(headerList: Headers): OperatorIdentity {
  const accessEmail = headerList.get("cf-access-authenticated-user-email")?.trim();
  if (accessEmail) return { kind: "operator", email: accessEmail };

  const developmentEnabled =
    process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_OPERATOR === "true";
  const developmentEmail = process.env.DEV_OPERATOR_EMAIL?.trim();
  if (developmentEnabled && developmentEmail) {
    return { kind: "operator", email: developmentEmail };
  }
  throw unauthorized();
}

export async function requireOperator() {
  try {
    return operatorFromHeaders(await headers());
  } catch (error) {
    if (error instanceof AppError && error.status === 401) interruptUnauthorized();
    throw error;
  }
}
