import { currentLocale, messages } from "../i18n";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
    public readonly requestId = "",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Envelope<T> = { data: T; meta?: Record<string, unknown> };
type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    requestId?: string;
  };
};

let csrfToken = "";
let unauthorizedHandler: (() => void) | undefined;

export function setCSRFToken(value: string) {
  csrfToken = value;
}

export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = undefined;
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  const headers = new Headers(init.headers);
  headers.set("Accept-Language", currentLocale());
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (mutation && csrfToken) headers.set("X-CSRF-Token", csrfToken);
  try {
    const response = await fetch(path, {
      ...init,
      headers,
      credentials: "include",
      signal: init.signal ?? controller.signal,
    });
    if (response.status === 204) return undefined as T;
    const body = (await response.json().catch(() => undefined)) as
      Envelope<T> | ApiErrorEnvelope | undefined;
    if (!response.ok) {
      const detail = body && "error" in body ? body.error : undefined;
      const error = new ApiError(
        response.status,
        detail?.code ?? "request_failed",
        detail?.message ?? messages[currentLocale()].api.requestFailed,
        detail?.fields,
        detail?.requestId ?? response.headers.get("X-Request-ID") ?? "",
      );
      if (response.status === 401) unauthorizedHandler?.();
      throw error;
    }
    if (!body || !("data" in body))
      throw new ApiError(
        response.status,
        "invalid_response",
        messages[currentLocale()].api.invalidResponse,
      );
    return body.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(0, "request_timeout", messages[currentLocale()].api.timeout);
    }
    throw new ApiError(0, "network_error", messages[currentLocale()].api.network);
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <I, O>(path: string, input: I) =>
    request<O>(path, { method: "POST", body: JSON.stringify(input) }),
  put: <I, O>(path: string, input: I) =>
    request<O>(path, { method: "PUT", body: JSON.stringify(input) }),
  patch: <I, O>(path: string, input: I) =>
    request<O>(path, { method: "PATCH", body: JSON.stringify(input) }),
  delete: <O>(path: string) => request<O>(path, { method: "DELETE" }),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : messages[currentLocale()].api.unexpected;
}
