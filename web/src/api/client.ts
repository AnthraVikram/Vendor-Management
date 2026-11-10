export class ApiError extends Error {
  status: number;
  body: { message?: string; code?: string; fields?: Record<string, string> };

  constructor(status: number, body: ApiError['body']) {
    super(body.message ?? 'Request failed');
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await apiWithHeaders<T>(path, init)).data;
}

// The same request, also returning the response headers, for lists that send their counts there (Feature 005 FR-006).
export async function apiWithHeaders<T>(path: string, init: RequestInit = {}): Promise<{ data: T; headers: { get: (name: string) => string | null } }> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ message: response.statusText }))) as ApiError['body'];
    // FR-027: no internal detail for a failure, and one plain wording for a refusal by role. A 403 with any other
    // code (OWN_ROLE, PREVIEW_NOT_YOURS) is a business rule, so its own message is kept.
    if (response.status >= 500) body.message = 'The action did not complete. Please try again.';
    if (response.status === 403 && (!body.code || body.code === 'ROLE_NOT_ALLOWED')) body.message = 'You are not allowed to do this.';
    throw new ApiError(response.status, body);
  }
  if (response.status === 204) return { data: undefined as T, headers: response.headers };
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return { data: (await response.blob()) as T, headers: response.headers };
  return { data: (await response.json()) as T, headers: response.headers };
}
