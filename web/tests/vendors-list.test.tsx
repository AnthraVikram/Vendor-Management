import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Vendors } from '../src/pages/vendors';

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const sharma = {
  id: 'v1', name: 'Sharma Interiors', contact_person: 'Ravi Sharma', phone: '98765 43210',
  categories: [{ id: 'c1', name: 'Carpentry' }, { id: 'c2', name: 'Tiling' }],
  locations: ['Pune', 'Mumbai'], availability: 'LIMITED', archived: false, project_count: 3,
};
const rao = {
  id: 'v2', name: 'Rao Glass', contact_person: null, phone: '98000 00002',
  categories: [{ id: 'c3', name: 'Glass and aluminium' }],
  locations: [], availability: null, archived: true, project_count: 1,
};

// Answers /api/vendors from `vendorPages` in order (the first load, then each search), and lists for the filters.
function mockFetch(vendorPages: unknown[][]) {
  const pages = [...vendorPages];
  const fetchMock = vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url.startsWith('/api/vendors?')) return json(200, pages.length > 1 ? pages.shift() : pages[0]);
    if (url === '/api/categories') return json(200, [{ id: 'c1', name: 'Carpentry' }]);
    if (url.startsWith('/api/projects')) return json(200, [{ id: 'p1', name: 'Lake House' }]);
    return json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('vendor directory list', () => {
  it('shows who each vendor is and how to reach them (US2-1, US2-4)', async () => {
    mockFetch([[sharma, rao]]);
    render(<Vendors openVendor={() => undefined} />);
    const table = await screen.findByRole('table', { name: 'Vendors' });
    const sharmaRow = within(table).getByRole('button', { name: 'Sharma Interiors' }).closest('tr')!;
    expect(within(sharmaRow).getByText('Ravi Sharma')).toBeInTheDocument();
    expect(within(sharmaRow).getByText('98765 43210')).toBeInTheDocument();
    expect(within(sharmaRow).getByText('Carpentry, Tiling')).toBeInTheDocument();
    expect(within(sharmaRow).getByText('Pune, Mumbai')).toBeInTheDocument();
    expect(within(sharmaRow).getByText('Limited')).toBeInTheDocument();
    expect(within(sharmaRow).getByText('3 projects')).toBeInTheDocument();

    const raoRow = within(table).getByRole('button', { name: 'Rao Glass' }).closest('tr')!;
    expect(within(raoRow).getByText('1 project')).toBeInTheDocument();
    expect(within(raoRow).getByText('Archived')).toBeInTheDocument();
  });

  it('opens a vendor when its name is selected', async () => {
    mockFetch([[sharma]]);
    const openVendor = vi.fn();
    render(<Vendors openVendor={openVendor} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sharma Interiors' }));
    expect(openVendor).toHaveBeenCalledWith('v1');
  });

  it('keeps the Feature 001 search and filter parameters (US2-2, US2-3)', async () => {
    const fetchMock = mockFetch([[sharma]]);
    render(<Vendors openVendor={() => undefined} />);
    await screen.findByRole('table', { name: 'Vendors' });
    // The add-vendor form also has a Category field, so look only inside the filter form.
    const filters = within(screen.getByRole('form', { name: 'Vendor filters' }));
    await userEvent.type(filters.getByLabelText('Search'), 'Ravi');
    await userEvent.selectOptions(filters.getByLabelText('Category'), 'c1');
    await userEvent.type(filters.getByLabelText('Location'), 'Pune');
    await userEvent.selectOptions(filters.getByLabelText('Availability'), 'LIMITED');
    await userEvent.selectOptions(filters.getByLabelText('Linked project'), 'p1');
    await userEvent.click(filters.getByLabelText('Include archived'));
    await userEvent.click(filters.getByRole('button', { name: 'Apply filters' }));
    const searched = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/vendors?')).at(-1)!;
    const params = new URLSearchParams(searched.split('?')[1]);
    expect(Object.fromEntries(params)).toEqual({
      q: 'Ravi', category_id: 'c1', location: 'Pune', availability: 'LIMITED', project_id: 'p1', include_archived: 'true',
    });
  });

  it('says nothing matches and keeps the search when a search finds no vendors (US2-5)', async () => {
    mockFetch([[sharma], []]);
    render(<Vendors openVendor={() => undefined} />);
    await screen.findByRole('table', { name: 'Vendors' });
    await userEvent.type(screen.getByLabelText('Search'), 'nobody');
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByText('No vendors match your search and filters')).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toHaveValue('nobody');
    expect(screen.queryByText('No vendors have been added yet')).not.toBeInTheDocument();
  });

  it('offers to add or import vendors when the directory is empty (US2-6, FR-031)', async () => {
    mockFetch([[]]);
    render(<Vendors openVendor={() => undefined} />);
    expect(await screen.findByText('No vendors have been added yet')).toBeInTheDocument();
    const empty = screen.getByText('No vendors have been added yet').closest('div')!;
    expect(within(empty).getByRole('link', { name: 'Import spreadsheet' })).toHaveAttribute('href', '#/vendors/import');
    await userEvent.click(within(empty).getByRole('button', { name: 'Add vendor' }));
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  it('shows a loading message, not an empty result, before the first load finishes', async () => {
    let release: (value: unknown) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.startsWith('/api/vendors?')) return new Promise((resolve) => { release = resolve; });
      return Promise.resolve(json(200, []));
    }));
    render(<Vendors openVendor={() => undefined} />);
    expect(await screen.findByText('Loading vendors')).toBeInTheDocument();
    expect(screen.queryByText('No vendors have been added yet')).not.toBeInTheDocument();
    release(json(200, [sharma]));
    expect(await screen.findByRole('table', { name: 'Vendors' })).toBeInTheDocument();
  });
});
