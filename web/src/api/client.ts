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
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ message: response.statusText }))) as ApiError['body'];
    throw new ApiError(response.status, body);
  }
  if (response.status === 204) return undefined as T;
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return (await response.blob()) as T;
  return (await response.json()) as T;
}
