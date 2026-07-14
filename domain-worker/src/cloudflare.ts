import { normalizeHostname } from './hostname.js';

const DEFAULT_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

export interface CloudflareErrorDetail {
  code?: number;
  message: string;
}

export interface CloudflareCustomHostname {
  id: string;
  hostname: string;
  status?: string;
  verification_errors?: string[];
  ssl?: {
    status?: string;
    method?: string;
    type?: string;
    validation_errors?: Array<{ message?: string }>;
  };
}

interface CloudflareEnvelope<T> {
  success: boolean;
  result?: T;
  errors?: CloudflareErrorDetail[];
  messages?: string[];
}

export class CloudflareApiError extends Error {
  readonly status: number;
  readonly errors: readonly CloudflareErrorDetail[];

  constructor(
    message: string,
    status: number,
    errors: readonly CloudflareErrorDetail[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CloudflareApiError';
    this.status = status;
    this.errors = errors;
  }

  get retryable(): boolean {
    return this.status === 0
      || this.status === 408
      || this.status === 409
      || this.status === 429
      || this.status >= 500
      || this.errors.some((error) => /already exists/iu.test(error.message));
  }
}

export interface CustomHostnameProvider {
  ensureCustomHostname(hostname: string): Promise<CloudflareCustomHostname>;
  findCustomHostname(hostname: string): Promise<CloudflareCustomHostname | null>;
  getCustomHostname(customHostnameId: string): Promise<CloudflareCustomHostname>;
  refreshCustomHostname(customHostnameId: string): Promise<CloudflareCustomHostname>;
  deleteCustomHostname(customHostnameId: string): Promise<boolean>;
}

export interface CloudflareClientOptions {
  apiToken: string;
  zoneId: string;
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  requestTimeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEnvelope<T>(value: unknown): value is CloudflareEnvelope<T> {
  return isRecord(value) && typeof value.success === 'boolean';
}

function errorDetails(payload: unknown): CloudflareErrorDetail[] {
  if (!isRecord(payload) || !Array.isArray(payload.errors)) return [];
  return payload.errors.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.message !== 'string') return [];
    return [{
      ...(typeof candidate.code === 'number' ? { code: candidate.code } : {}),
      message: candidate.message,
    }];
  });
}

function apiErrorMessage(status: number, statusText: string, errors: readonly CloudflareErrorDetail[]): string {
  const details = errors.map((error) => error.code === undefined
    ? error.message
    : `${error.code}: ${error.message}`).join('; ');
  return details || `Cloudflare API request failed with HTTP ${status}${statusText ? ` ${statusText}` : ''}.`;
}

function assertCustomHostname(value: unknown): CloudflareCustomHostname {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.hostname !== 'string') {
    throw new CloudflareApiError('Cloudflare returned an invalid custom hostname response.', 502);
  }
  return value as unknown as CloudflareCustomHostname;
}

export class CloudflareClient implements CustomHostnameProvider {
  private readonly apiToken: string;
  private readonly zoneId: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;

  constructor(options: CloudflareClientOptions) {
    this.apiToken = options.apiToken.trim();
    this.zoneId = options.zoneId.trim();
    if (!this.apiToken) throw new Error('Cloudflare API token is required.');
    if (!this.zoneId) throw new Error('Cloudflare zone ID is required.');

    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/u, '');
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  }

  async listCustomHostnames(hostname: string): Promise<CloudflareCustomHostname[]> {
    const normalized = normalizeHostname(hostname);
    const url = this.endpoint('/custom_hostnames');
    // The current API models this as hostname.exact. Filter again locally so
    // idempotency never selects a partial result if provider behavior changes.
    url.searchParams.set('hostname[exact]', normalized);
    url.searchParams.set('per_page', '50');

    const result = await this.request<unknown>(url);
    if (!Array.isArray(result)) {
      throw new CloudflareApiError('Cloudflare returned an invalid custom hostname list.', 502);
    }
    return result
      .map(assertCustomHostname)
      .filter((candidate) => candidate.hostname.toLowerCase() === normalized);
  }

  async findCustomHostname(hostname: string): Promise<CloudflareCustomHostname | null> {
    return (await this.listCustomHostnames(hostname))[0] ?? null;
  }

  async createCustomHostname(hostname: string): Promise<CloudflareCustomHostname> {
    const normalized = normalizeHostname(hostname);
    const result = await this.request<unknown>(this.endpoint('/custom_hostnames'), {
      method: 'POST',
      body: JSON.stringify({
        hostname: normalized,
        ssl: { method: 'http', type: 'dv' },
      }),
    });
    return assertCustomHostname(result);
  }

  async ensureCustomHostname(hostname: string): Promise<CloudflareCustomHostname> {
    const normalized = normalizeHostname(hostname);
    const existing = await this.findCustomHostname(normalized);
    if (existing) return existing;

    try {
      return await this.createCustomHostname(normalized);
    } catch (error) {
      // Another worker or an earlier timed-out request may have created it between
      // the list and POST. Re-list before surfacing any create error.
      if (error instanceof CloudflareApiError) {
        const raced = await this.findCustomHostname(normalized);
        if (raced) return raced;
      }
      throw error;
    }
  }

  async getCustomHostname(customHostnameId: string): Promise<CloudflareCustomHostname> {
    const id = this.requireId(customHostnameId);
    const result = await this.request<unknown>(this.endpoint(`/custom_hostnames/${encodeURIComponent(id)}`));
    return assertCustomHostname(result);
  }

  async refreshCustomHostname(customHostnameId: string): Promise<CloudflareCustomHostname> {
    const id = this.requireId(customHostnameId);
    const current = await this.getCustomHostname(id);
    if (current.status === 'active' && current.ssl?.status === 'active') return current;

    const result = await this.request<unknown>(this.endpoint(`/custom_hostnames/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      body: JSON.stringify({ ssl: { method: 'http', type: 'dv' } }),
    });
    return assertCustomHostname(result);
  }

  async deleteCustomHostname(customHostnameId: string): Promise<boolean> {
    const id = this.requireId(customHostnameId);
    try {
      await this.request<unknown>(this.endpoint(`/custom_hostnames/${encodeURIComponent(id)}`), {
        method: 'DELETE',
      });
      return true;
    } catch (error) {
      if (error instanceof CloudflareApiError && error.status === 404) return false;
      throw error;
    }
  }

  private endpoint(suffix: string): URL {
    return new URL(`${this.baseUrl}/zones/${encodeURIComponent(this.zoneId)}${suffix}`);
  }

  private requireId(value: string): string {
    const id = value.trim();
    if (!id) throw new Error('Cloudflare custom hostname ID is required.');
    return id;
  }

  private async request<T>(url: URL, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiToken}`,
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...init.headers,
        },
        signal: controller.signal,
      });
    } catch (error) {
      throw new CloudflareApiError('Cloudflare API request could not be completed.', 0, [], { cause: error });
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch (error) {
      throw new CloudflareApiError('Cloudflare API returned an invalid JSON response.', response.status, [], { cause: error });
    }

    const errors = errorDetails(payload);
    if (!response.ok) {
      throw new CloudflareApiError(apiErrorMessage(response.status, response.statusText, errors), response.status, errors);
    }

    if (isEnvelope<T>(payload)) {
      if (!payload.success || payload.result === undefined) {
        throw new CloudflareApiError(apiErrorMessage(response.status, response.statusText, errors), response.status, errors);
      }
      return payload.result;
    }

    // The current DELETE reference renders its successful response as a direct
    // `{ id }` object rather than the standard v4 envelope, so accept both forms.
    return payload as T;
  }
}
