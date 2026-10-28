import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Vendors } from '../src/pages/vendors';
import { VendorDetail } from '../src/pages/vendor-detail';

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body };
}

type Reply = (url: string, init?: RequestInit) => ReturnType<typeof json> | undefined;

function mockFetch(reply: Reply = () => undefined) {
  const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const custom = reply(url, init);
    if (custom) return custom;
    if (url.startsWith('/api/categories')) return json(200, [{ id: 'cat-1', name: 'Carpentry' }]);
    if (url.startsWith('/api/projects')) return json(200, [{ id: 'p1', name: 'Lake House' }]);
    if (url.startsWith('/api/vendors') && init?.method === 'POST') return json(201, { id: 'v-new' });
    return json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function vendorPosts(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls
    .filter((call) => String(call[0]) === '/api/vendors' && (call[1] as RequestInit | undefined)?.method === 'POST')
    .map((call) => JSON.parse(String((call[1] as RequestInit).body)));
}

async function createForm() {
  return screen.findByRole('form', { name: 'Add vendor' });
}

describe('vendor create form', () => {
  it('sends every directory field the API accepts', async () => {
    const fetchMock = mockFetch();
    render(<Vendors openVendor={() => undefined} />);
    const form = await createForm();
    const type = async (label: string, value: string) => userEvent.type(within(form).getByLabelText(label), value);
    await type('Name', 'Mehta Joinery');
    await type('Phone', '9100000011');
    await type('Category', 'Carpentry');
    await type('Contact person', 'Ravi Kumar');
    await type('Alternate phone', '9100000012');
    await type('Email', 'mehta@example.com');
    await type('Address', '12 Lake Road');
    await type('Locations', 'Chennai, Madurai');
    await type('Services', 'Joinery');
    await type('Materials', 'Teak');
    await userEvent.click(within(form).getByLabelText('GST registered'));
    await type('GSTIN', '22AAAAA0000A1Z5');
    await type('GST legal name', 'Mehta Joinery Pvt');
    await type('Team size', '4');
    await userEvent.selectOptions(within(form).getByLabelText('Manpower availability'), 'LIMITED');
    await type('Manpower note', 'Two crews');
    await type('Rate label', 'Day');
    await type('Rate amount', '1500.00');
    await type('Rate unit', 'day');
    await userEvent.click(within(form).getByRole('button', { name: 'Save vendor' }));

    expect(vendorPosts(fetchMock)).toEqual([
      {
        name: 'Mehta Joinery',
        phone: '9100000011',
        category_ids: ['cat-1'],
        contact_person: 'Ravi Kumar',
        alternate_phone: '9100000012',
        email: 'mehta@example.com',
        address: '12 Lake Road',
        locations: ['Chennai', 'Madurai'],
        services: ['Joinery'],
        materials: ['Teak'],
        gst_registered: true,
        gstin: '22AAAAA0000A1Z5',
        gst_legal_name: 'Mehta Joinery Pvt',
        team_size: 4,
        availability: 'LIMITED',
        manpower_note: 'Two crews',
        rates: [{ label: 'Day', amount: '1500.00', unit: 'day' }],
      },
    ]);
  });

  it('warns about a duplicate phone and saves only after confirmation', async () => {
    let attempts = 0;
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/vendors' && init?.method === 'POST') {
        attempts += 1;
        if (attempts === 1) {
          return json(409, {
            code: 'PHONE_IN_USE',
            message: 'Another vendor already uses this phone number.',
            matches: [{ id: 'v-old', name: 'Existing Vendor' }],
          });
        }
      }
      return undefined;
    });
    render(<Vendors openVendor={() => undefined} />);
    const form = await createForm();
    await userEvent.type(within(form).getByLabelText('Name'), 'Copy');
    await userEvent.type(within(form).getByLabelText('Phone'), '9100000011');
    await userEvent.type(within(form).getByLabelText('Category'), 'Carpentry');
    await userEvent.click(within(form).getByRole('button', { name: 'Save vendor' }));

    expect(await screen.findByText(/Existing Vendor/)).toBeInTheDocument();
    expect(vendorPosts(fetchMock)).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    const posts = vendorPosts(fetchMock);
    expect(posts).toHaveLength(2);
    expect(posts[1]).toMatchObject({ name: 'Copy', phone: '9100000011', confirm_duplicate_phone: true });
  });
});

describe('vendor filters', () => {
  it('filters by linked project', async () => {
    const fetchMock = mockFetch();
    render(<Vendors openVendor={() => undefined} />);
    const filters = await screen.findByRole('form', { name: 'Vendor filters' });
    const select = within(filters).getByRole('combobox', { name: 'Linked project' });
    await within(select).findByRole('option', { name: 'Lake House' });
    await userEvent.selectOptions(select, 'p1');
    await userEvent.click(within(filters).getByRole('button', { name: 'Apply filters' }));
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('/api/projects?include_archived=true');
    expect(urls.some((url) => url.startsWith('/api/vendors?') && url.includes('project_id=p1'))).toBe(true);
  });
});

// Part (d) of T075 covers VendorDetail, which T077 implements. T077 waits on T093, so this stays skipped until then.
describe.skip('vendor detail notes and history (enable with T077)', () => {
  it('sends the chosen note type and lists rating history and notes with author and date', async () => {
    const vendor = {
      id: 'v1',
      name: 'Mehta',
      phone: '9100000011',
      archived: false,
      availability: null,
      rates: [],
      links: [],
      current_rating: { score: 3 },
      rating_history: [
        { id: 'r1', score: 5, comment: null, created_at: '2026-10-20T10:00:00.000Z', author: { id: 'u1', name: 'Asha Admin' } },
        { id: 'r2', score: 3, comment: null, created_at: '2026-10-21T10:00:00.000Z', author: { id: 'u2', name: 'Omar Office' } },
      ],
      notes: [
        { id: 'n1', note_type: 'RELIABILITY', body: 'Called back', created_at: '2026-10-22T10:00:00.000Z', author: { id: 'u2', name: 'Omar Office' } },
      ],
    };
    const fetchMock = mockFetch((url) => (url === '/api/vendors/v1' ? json(200, vendor) : undefined));
    render(<VendorDetail id="v1" />);
    expect(await screen.findByText(/Asha Admin/)).toBeInTheDocument();
    expect(screen.getAllByText(/Omar Office/).length).toBeGreaterThan(1);
    expect(screen.getByText(/2026-10-20/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Note type'), 'PAST_WORK');
    await userEvent.type(screen.getByLabelText('Note'), 'Did the lobby');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    const note = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/vendors/v1/notes');
    expect(JSON.parse(String((note?.[1] as RequestInit).body))).toEqual({ note_type: 'PAST_WORK', body: 'Did the lobby' });
  });
});
