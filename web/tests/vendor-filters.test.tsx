import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Vendors } from '../src/pages/vendors';

describe('vendor filters', () => {
  it('sends category and location filters', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.startsWith('/api/categories')) {
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => [{ id: 'cat-1', name: 'Carpentry' }] };
      }
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => [] };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Vendors openVendor={() => undefined} />);
    const filters = await screen.findByRole('form', { name: 'Vendor filters' });
    // The form renders at once, but its category options arrive with a separate request.
    await within(filters).findByRole('option', { name: 'Carpentry' });
    await userEvent.selectOptions(within(filters).getByRole('combobox', { name: 'Category' }), 'cat-1');
    await userEvent.type(within(filters).getByRole('textbox', { name: 'Location' }), 'Chennai');
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    const calls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes('category_id=cat-1') && url.includes('location=Chennai'))).toBe(true);
  });
});
