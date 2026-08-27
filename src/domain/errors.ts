export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(code, message, 400, details);

export const payloadTooLarge = (maximumBytes: number) =>
  new AppError("PAYLOAD_TOO_LARGE", "The request body exceeds the configured size limit.", 413, {
    maximum_bytes: maximumBytes,
  });

export const unauthorized = () =>
  new AppError("AUTHENTICATION_REQUIRED", "Authentication failed.", 401);

export const forbidden = (message = "This identity cannot access the requested workspace.") =>
  new AppError("FORBIDDEN", message, 403);

export const notFound = (resource: string) =>
  new AppError("NOT_FOUND", `${resource} was not found.`, 404);

export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(code, message, 409, details);

export const unavailable = (code: string, message: string) => new AppError(code, message, 503);
