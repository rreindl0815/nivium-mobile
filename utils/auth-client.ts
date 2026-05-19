import type { AuthSession, MagicLinkRequestResult, UpdatesSignupResult } from '@/types/auth';

const DEFAULT_ENDPOINT = process.env.EXPO_PUBLIC_NIVIUM_AUTH_ENDPOINT?.trim() ?? '';
const AUTH_TIMEOUT_MS = 20000;

function normalizeEndpoint(endpoint: string) {
  return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
}

function getConfiguredEndpoint() {
  return normalizeEndpoint(DEFAULT_ENDPOINT);
}

export function getAuthEndpoint() {
  return getConfiguredEndpoint();
}

export function isAuthServiceConfigured() {
  return Boolean(getConfiguredEndpoint());
}

async function requestJson<T>(path: string, init: RequestInit = {}) {
  const endpoint = getConfiguredEndpoint();
  if (!endpoint) {
    throw new Error('Nivium account service is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${endpoint}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const detail =
        payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : `Request failed with status ${response.status}.`;
      throw new Error(detail);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Nivium account request timed out after ${AUTH_TIMEOUT_MS} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestMagicLinkAsync(input: {
  email: string;
  displayName?: string;
  updatesOptIn?: boolean;
  next?: string;
}) {
  return requestJson<MagicLinkRequestResult>('/auth/request-magic-link', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      displayName: input.displayName ?? '',
      updatesOptIn: input.updatesOptIn === true,
      next: input.next,
    }),
  });
}

export async function exchangeMagicLinkAsync(token: string) {
  return requestJson<AuthSession>('/auth/exchange', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function fetchSessionAsync(sessionToken: string) {
  return requestJson<{ user: AuthSession['user'] }>('/auth/session', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });
}

export async function submitUpdatesSignupAsync(input: {
  email: string;
  displayName?: string;
  source?: string;
}) {
  return requestJson<UpdatesSignupResult>('/auth/updates-signup', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      displayName: input.displayName ?? '',
      source: input.source ?? 'profile-defaults',
    }),
  });
}
