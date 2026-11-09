import { act, screen } from '@testing-library/react';
import { api, ApiError } from '../src/api/client';

// Feature 004 US7-5 to US7-8 (FR-026, FR-027): plain wording for failures, and one confirmation region.

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

async function failureOf(status: number, body: unknown): Promise<ApiError> {
  vi.stubGlobal('fetch', vi.fn(async () => json(status, body)));
  return api('/api/anything').then(
    () => { throw new Error('expected a failure'); },
    (caught: ApiError) => caught,
  );
}

describe('api() error messages (FR-027)', () => {
  it('says an unexpected failure did not complete, with no internal detail', async () => {
    const error = await failureOf(500, { message: 'PrismaClientKnownRequestError: relation "vendors" does not exist' });
    expect(error.status).toBe(500);
    expect(error.message).toBe('The action did not complete. Please try again.');
    expect(error.body.message).toBe('The action did not complete. Please try again.');
  });

  it('says a role refusal is not allowed, keeping its code', async () => {
    const error = await failureOf(403, { message: 'Only an Administrator or an Accountant can record or reverse a client advance.', code: 'ROLE_NOT_ALLOWED' });
    expect(error.status).toBe(403);
    expect(error.message).toBe('You are not allowed to do this.');
    expect(error.body.code).toBe('ROLE_NOT_ALLOWED');
  });

  it('says a role refusal with no code is not allowed (staff management)', async () => {
    const error = await failureOf(403, { message: 'You cannot manage staff accounts.' });
    expect(error.message).toBe('You are not allowed to do this.');
  });

  it.each([
    ['OWN_ROLE', 'You cannot change your own role.'],
    ['PREVIEW_NOT_YOURS', 'Only the person who uploaded this file can use its preview.'],
  ])('keeps the server message of a business-rule 403 (%s)', async (code, message) => {
    const error = await failureOf(403, { message, code });
    expect(error.message).toBe(message);
    expect(error.body.code).toBe(code);
  });

  it('keeps the field messages of a refused save', async () => {
    const error = await failureOf(400, { message: 'Check the highlighted fields.', fields: { name: 'Name is required.' } });
    expect(error.message).toBe('Check the highlighted fields.');
    expect(error.body.fields).toEqual({ name: 'Name is required.' });
  });

  it('keeps the code and message of a conflict', async () => {
    const error = await failureOf(409, { message: 'This vendor is already assigned to this project.', code: 'LINK_EXISTS' });
    expect(error.message).toBe('This vendor is already assigned to this project.');
    expect(error.body.code).toBe('LINK_EXISTS');
  });
});

describe('confirmation region (FR-026)', () => {
  it('shows the latest notify message in the app shell status region', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) =>
        String(input) === '/api/auth/me' ? json(200, { id: 'u1', name: 'Omar Office', email: 'omar@example.com', role: 'OFFICE_TEAM' }) : json(200, []),
      ),
    );
    window.location.hash = '/vendors';
    document.body.innerHTML = '<div id="root"></div>';
    vi.resetModules();
    await act(async () => {
      await import('../src/main');
    });
    const region = await screen.findByRole('status');
    const { notify } = await import('../src/notify');
    // The timer starts inside the handler, so fake timers set now control it.
    vi.useFakeTimers();
    try {
      act(() => notify('Vendor archived'));
      expect(region).toHaveTextContent('Vendor archived');
      act(() => vi.advanceTimersByTime(4999));
      expect(region).toHaveTextContent('Vendor archived');
      act(() => vi.advanceTimersByTime(1));
      expect(region).toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });
});
