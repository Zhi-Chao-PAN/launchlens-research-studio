import type { ProviderFallbackDetail, ProviderFallbackReason } from "@/lib/providers/provider.types";

export class ProviderRequestError extends Error {
  readonly kind: "network" | "http";
  readonly status?: number;

  constructor(
    kind: "network" | "http",
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ProviderRequestError";
    this.kind = kind;
    this.status = options.status;
  }
}

export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function isRetriableProviderError(error: unknown): boolean {
  return error instanceof ProviderRequestError;
}

export function classifyProviderRequestError(
  error: unknown,
): ProviderFallbackReason {
  if (
    (error instanceof ProviderRequestError && error.kind === "http") ||
    (error instanceof Error && error.message.startsWith("sse HTTP "))
  ) {
    return "http_error";
  }
  return "network_error";
}

export function providerRequestErrorDetail(
  error: unknown,
): ProviderFallbackDetail | undefined {
  if (error instanceof ProviderRequestError) {
    return {
      ...(typeof error.status === "number" ? { status: error.status } : {}),
      message: error.message,
    };
  }
  if (error instanceof Error) {
    const sseStatus = /^sse HTTP (\d+)/.exec(error.message);
    if (sseStatus) {
      return {
        status: Number(sseStatus[1]),
        message: error.message,
      };
    }
    return { message: error.message };
  }
  if (error != null) {
    return { message: String(error) };
  }
  return undefined;
}
