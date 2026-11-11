import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectSections, type SectionsProject } from '../src/pages/project-sections';
import { VendorDetail } from '../src/pages/vendor-detail';
import { canLeave } from '../src/ui/unsaved-guard';
import { collectNotices } from './notices';

// Feature 005 US2 (T023): the project page's sections and the vendors responsible for them (US2-1 to US2-10, FR-007).

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body };
}

const mehta = {
  id: 'a1', vendor_id: 'v1', vendor_name: 'Mehta Carpentry', vendor_archived: false, vendor_phone: '9800000001',
  vendor_contact_person: 'Ravi Mehta', vendor_categories: [{ id: 'c1', name: 'Carpentry' }], role_in_section: 'Lead carpenter',
};
const rao = { ...mehta, id: 'a2', vendor_id: 'v2', vendor_name: 'Rao Electrical', vendor_phone: '9800000002', vendor_contact_person: null, vendor_categories: [{ id: 'c2', name: 'Electrical' }], role_in_section: 'Wiring' };
const long = 'Civil works, carpentry, electrical and plumbing for the whole house. '.repeat(6);

function sectionsProject(overrides: Partial<SectionsProject> = {}): SectionsProject {
  return {
    id: 'p1',
    archived: false,
    links: [{ vendor_id: 'v1' }],
    sections_version: '2026-11-10T05:00:00.000Z',
    sections: [
      { id: 's1', name: 'Project Overview', position: 0, description: null, notes: null, assignments: [] },
      { id: 's2', name: 'Execution', position: 1, description: long, notes: 'Start after sign-off', assignments: [mehta, rao] },
      { id: 's3', name: 'Site Coordination', position: 2, description: null, notes: null, assignments: [mehta] },
    ],
    removed_sections: [
      { id: 's9', name: 'Budget & Costing', description: null, notes: 'Text only', removed_at: '2026-11-09T08:35:00.000Z', removed_by: { id: 'u1', name: 'Asha Admin' }, past_assignments: [] },
    ],
    ...overrides,
  };
}

const vendors = [
  { id: 'v1', name: 'Mehta Carpentry' },
  { id: 'v2', name: 'Rao Electrical' },
  { id: 'v3', name: 'Nair Tile Studio' },
];

function mockWrites(answer: (url: string, init: RequestInit) => { status: number; body: unknown } = () => ({ status: 200, body: {} })) {
  const fetchMock = vi.fn(async (input: RequestInfo, init: RequestInit = {}) => {
    const result = answer(String(input), init);
    return json(result.status, result.body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function calls(fetchMock: ReturnType<typeof mockWrites>) {
  return fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), method: (init as RequestInit | undefined)?.method, body: (init as RequestInit | undefined)?.body ? JSON.parse(String((init as RequestInit).body)) : undefined }));
}

function renderSections(project = sectionsProject(), onChanged = vi.fn()) {
  render(<ProjectSections project={project} vendors={vendors} onChanged={onChanged} />);
  return { onChanged, region: screen.getByRole('region', { name: 'Sections' }) };
}

afterEach(() => vi.restoreAllMocks());

describe('project sections (US2-1 to US2-3)', () => {
  it('shows each section in order with its description, notes and vendors', () => {
    mockWrites();
    const { region } = renderSections();
    const cards = within(region).getAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual(['Project Overview', 'Execution', 'Site Coordination']);
    const execution = within(region).getByRole('article', { name: 'Execution' });
    expect(execution).toHaveTextContent('Start after sign-off');
    const people = within(execution).getAllByRole('listitem');
    expect(people[0]).toHaveTextContent('Mehta Carpentry');
    expect(people[0]).toHaveTextContent('9800000001');
    expect(people[0]).toHaveTextContent('Ravi Mehta');
    expect(people[0]).toHaveTextContent('Carpentry');
    expect(people[0]).toHaveTextContent('Lead carpenter');
    expect(within(people[0]).getByRole('link', { name: 'Mehta Carpentry' })).toHaveAttribute('href', '#/vendors/v1');
    expect(people[1]).toHaveTextContent('Rao Electrical');
    expect(within(region).getByRole('article', { name: 'Site Coordination' })).toHaveTextContent('Mehta Carpentry');
  });

  it('collapses a long description behind Show more', async () => {
    mockWrites();
    const { region } = renderSections();
    const execution = within(region).getByRole('article', { name: 'Execution' });
    expect(execution).not.toHaveTextContent(long.trim());
    await userEvent.click(within(execution).getByRole('button', { name: 'Show more' }));
    expect(execution).toHaveTextContent(long.trim());
  });

  it('renames a section in place', async () => {
    const fetchMock = mockWrites();
    const { region, onChanged } = renderSections();
    const overview = within(region).getByRole('article', { name: 'Project Overview' });
    await userEvent.click(within(overview).getByRole('button', { name: 'Rename' }));
    const input = within(overview).getByLabelText('Section name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Overview');
    await userEvent.click(within(overview).getByRole('button', { name: 'Save' }));
    expect(calls(fetchMock)).toContainEqual({ url: '/api/sections/s1', method: 'PATCH', body: { name: 'Overview' } });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('edits the description and notes, and asks before leaving unsaved text', async () => {
    const fetchMock = mockWrites();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { region } = renderSections();
    const overview = within(region).getByRole('article', { name: 'Project Overview' });
    await userEvent.click(within(overview).getByRole('button', { name: 'Edit text' }));
    await userEvent.type(within(overview).getByLabelText('Description'), 'Lakeside home');
    expect(canLeave()).toBe(false);
    await userEvent.type(within(overview).getByLabelText('Notes'), 'Client prefers teak');
    await userEvent.click(within(overview).getByRole('button', { name: 'Save' }));
    expect(calls(fetchMock)).toContainEqual({ url: '/api/sections/s1', method: 'PATCH', body: { description: 'Lakeside home', notes: 'Client prefers teak' } });
  });

  it('moves a section and saves the new order with the version it read', async () => {
    const fetchMock = mockWrites((url) => (url.endsWith('/order') ? { status: 200, body: { sections: [] } } : { status: 200, body: {} }));
    const { region } = renderSections();
    await userEvent.click(within(region).getByRole('button', { name: 'Move Site Coordination up' }));
    await userEvent.click(within(region).getByRole('button', { name: 'Save order' }));
    expect(calls(fetchMock)).toContainEqual({
      url: '/api/projects/p1/sections/order',
      method: 'PUT',
      body: { section_ids: ['s1', 's3', 's2'], sections_version: '2026-11-10T05:00:00.000Z' },
    });
  });

  it('shows the current order when someone else changed it first', async () => {
    const server = [
      { id: 's3', name: 'Site Coordination', position: 0, description: null, notes: null, assignments: [] },
      { id: 's1', name: 'Project Overview', position: 1, description: null, notes: null, assignments: [] },
      { id: 's2', name: 'Execution', position: 2, description: null, notes: null, assignments: [] },
    ];
    mockWrites(() => ({ status: 409, body: { message: 'The sections were changed by someone else.', code: 'SECTIONS_CHANGED', sections: server, sections_version: 'v2' } }));
    const { region } = renderSections();
    await userEvent.click(within(region).getByRole('button', { name: 'Move Execution down' }));
    await userEvent.click(within(region).getByRole('button', { name: 'Save order' }));
    expect(await within(region).findByText(/changed the order/)).toBeInTheDocument();
    expect(within(region).getAllByRole('article').map((card) => within(card).getByRole('heading').textContent)).toEqual(['Site Coordination', 'Project Overview', 'Execution']);
  });

  it('adds a custom section', async () => {
    const fetchMock = mockWrites(() => ({ status: 201, body: {} }));
    const { region } = renderSections();
    await userEvent.type(within(region).getByLabelText('New section name'), 'Landscaping');
    await userEvent.click(within(region).getByRole('button', { name: 'Add section' }));
    expect(calls(fetchMock)).toContainEqual({ url: '/api/projects/p1/sections', method: 'POST', body: { name: 'Landscaping' } });
  });
});

describe('removing and restoring sections (US2-7, FR-010a)', () => {
  it('asks before removing a section, naming the vendors assigned to it', async () => {
    const fetchMock = mockWrites();
    const { region } = renderSections();
    const execution = within(region).getByRole('article', { name: 'Execution' });
    await userEvent.click(within(execution).getByRole('button', { name: 'Remove section' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove Execution?' });
    expect(dialog).toHaveTextContent('Mehta Carpentry, Rao Electrical');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(calls(fetchMock)).toContainEqual({ url: '/api/sections/s2', method: 'DELETE', body: undefined });
  });

  it('lists removed sections with who removed them, and restores one', async () => {
    const fetchMock = mockWrites();
    const notices = collectNotices();
    const { region } = renderSections();
    const removed = within(region).getByRole('group', { name: /Removed sections/ });
    expect(removed).toHaveTextContent('Budget & Costing');
    expect(removed).toHaveTextContent('Asha Admin');
    expect(removed).toHaveTextContent('9 Nov 2026, 14:05');
    await userEvent.click(within(removed).getByRole('button', { name: 'Restore Budget & Costing' }));
    expect(calls(fetchMock)).toContainEqual({ url: '/api/sections/s9/restore', method: 'POST', body: undefined });
    await waitFor(() => expect(notices).toContain('Section restored'));
  });

  it('offers the standard blueprint only when the project has no sections', async () => {
    const fetchMock = mockWrites(() => ({ status: 201, body: { sections: [] } }));
    const { region } = renderSections(sectionsProject({ sections: [], removed_sections: [] }));
    expect(region).toHaveTextContent('This project has no sections yet');
    await userEvent.click(within(region).getByRole('button', { name: 'Use the standard blueprint' }));
    expect(calls(fetchMock)).toContainEqual({ url: '/api/projects/p1/sections/blueprint', method: 'POST', body: undefined });
  });

  it('does not offer the blueprint when the project has sections', () => {
    mockWrites();
    const { region } = renderSections();
    expect(within(region).queryByRole('button', { name: 'Use the standard blueprint' })).toBeNull();
  });
});

describe('assigning vendors to sections (US2-4 to US2-6, FR-015a)', () => {
  it('assigns a vendor already on the project, with a role', async () => {
    const fetchMock = mockWrites(() => ({ status: 201, body: { assignment: { id: 'a9' }, project_assignment_created: false } }));
    const notices = collectNotices();
    const { region } = renderSections();
    const overview = within(region).getByRole('article', { name: 'Project Overview' });
    await userEvent.selectOptions(within(overview).getByLabelText('Vendor'), 'v1');
    await userEvent.type(within(overview).getByLabelText('Role in this section'), 'Survey');
    await userEvent.click(within(overview).getByRole('button', { name: 'Assign' }));
    expect(calls(fetchMock)).toContainEqual({ url: '/api/sections/s1/assignments', method: 'POST', body: { vendor_id: 'v1', role_in_section: 'Survey' } });
    await waitFor(() => expect(notices).toContain('Vendor assigned to Project Overview'));
  });

  it('says when a vendor will also be added to the project, and confirms both', async () => {
    mockWrites(() => ({ status: 201, body: { assignment: { id: 'a9' }, project_assignment_created: true } }));
    const notices = collectNotices();
    const { region } = renderSections();
    const overview = within(region).getByRole('article', { name: 'Project Overview' });
    await userEvent.selectOptions(within(overview).getByLabelText('Vendor'), 'v3');
    expect(overview).toHaveTextContent('Nair Tile Studio is not on this project yet and will be added to it.');
    await userEvent.click(within(overview).getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(notices).toContain('Vendor assigned to project and to Project Overview'));
  });

  it('removes a vendor from one section only', async () => {
    const fetchMock = mockWrites();
    const { region } = renderSections();
    const execution = within(region).getByRole('article', { name: 'Execution' });
    await userEvent.click(within(execution).getByRole('button', { name: 'Remove Mehta Carpentry from Execution' }));
    // Superseded (Feature 005 FR-043, T042): removing a vendor from a section asks first.
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Remove Mehta Carpentry from Execution?' })).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(calls(fetchMock).filter((call) => call.method === 'DELETE')).toHaveLength(1));
    expect(calls(fetchMock)).toContainEqual({ url: '/api/section-assignments/a1', method: 'DELETE', body: undefined });
    expect(calls(fetchMock).filter((call) => call.method === 'DELETE')).toHaveLength(1);
  });

  // T048 observation O1 (NFR-003): the removed row's button disappears, so focus moves to the section's heading.
  it('moves focus to the section heading once the vendor is removed from it', async () => {
    mockWrites();
    const project = sectionsProject();
    const onChanged = vi.fn();
    const { rerender } = render(<ProjectSections project={project} vendors={vendors} onChanged={onChanged} />);
    const execution = screen.getByRole('article', { name: 'Execution' });
    await userEvent.click(within(execution).getByRole('button', { name: 'Remove Mehta Carpentry from Execution' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Remove Mehta Carpentry from Execution?' })).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // The page reloads the project without the removed assignment.
    const reloaded = { ...project, sections: project.sections.map((section) => (section.id === 's2' ? { ...section, assignments: [rao] } : section)) };
    rerender(<ProjectSections project={reloaded} vendors={vendors} onChanged={onChanged} />);
    expect(within(execution).queryByRole('button', { name: 'Remove Mehta Carpentry from Execution' })).toBeNull();
    expect(within(execution).getByRole('heading', { name: 'Execution' })).toHaveFocus();
  });

  it('returns focus to the Remove button when removing from a section is cancelled', async () => {
    mockWrites();
    const { region } = renderSections();
    const button = within(within(region).getByRole('article', { name: 'Execution' })).getByRole('button', { name: 'Remove Mehta Carpentry from Execution' });
    await userEvent.click(button);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(button).toHaveFocus();
  });

  it('keeps focus on the Remove button when removing from a section is refused', async () => {
    mockWrites((url, init) => (init.method === 'DELETE' ? { status: 409, body: { message: 'Refused.' } } : { status: 200, body: {} }));
    const { region, onChanged } = renderSections();
    const button = within(within(region).getByRole('article', { name: 'Execution' })).getByRole('button', { name: 'Remove Mehta Carpentry from Execution' });
    await userEvent.click(button);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    expect(await within(region).findByRole('alert')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
  });

  it('edits a role in a section, and asks before leaving unsaved text', async () => {
    const fetchMock = mockWrites();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { region } = renderSections();
    const coordination = within(region).getByRole('article', { name: 'Site Coordination' });
    await userEvent.click(within(coordination).getByRole('button', { name: 'Edit role of Mehta Carpentry' }));
    const role = within(coordination).getByLabelText('Role of Mehta Carpentry');
    await userEvent.clear(role);
    await userEvent.type(role, 'Supervisor');
    expect(canLeave()).toBe(false);
    await userEvent.click(within(coordination).getByRole('button', { name: 'Save role' }));
    expect(calls(fetchMock)).toContainEqual({ url: '/api/section-assignments/a1', method: 'PATCH', body: { role_in_section: 'Supervisor' } });
  });

  it('is read-only on an archived project', () => {
    mockWrites();
    const { region } = renderSections(sectionsProject({ archived: true }));
    expect(within(region).queryAllByRole('button').map((button) => button.textContent)).toEqual(expect.not.arrayContaining(['Rename', 'Assign', 'Add section', 'Remove section']));
    expect(within(region).queryByRole('button', { name: /^Restore/ })).toBeNull();
  });
});

describe('vendor profile sections (US2-8)', () => {
  it("names the sections the vendor works on in each project", async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url === '/api/vendors/v1') {
        return json(200, {
          id: 'v1', name: 'Mehta Carpentry', contact_person: null, phone: '9800000001', alternate_phone: null, email: null, address: null,
          categories: [], services: [], materials: [], locations: [], team_size: null, availability: null, manpower_note: null,
          gst_registered: false, gstin: null, gst_legal_name: null, archived: false, rates: [], notes: [], current_rating: null, import_run: null,
          project_count: 1, past_links: [],
          links: [{
            id: 'l1', project_id: 'p1', project_name: 'Lake House', project_status: 'ACTIVE', project_archived: false,
            role_on_project: null, scope_of_work: null, note: null, assignment_status: 'NO_ACTIVITIES',
            sections: [{ id: 's2', name: 'Execution', role_in_section: 'Lead carpenter' }, { id: 's3', name: 'Site Coordination', role_in_section: null }],
          }],
        });
      }
      if (url.startsWith('/api/history?')) return json(200, { record: { created_at: '2026-10-24T05:00:00.000Z', created_by: { id: 'u1', name: 'Asha' }, updated_at: '2026-10-24T05:00:00.000Z', updated_by: { id: 'u1', name: 'Asha' } }, entries: [] });
      return json(200, []);
    }));
    render(<VendorDetail id="v1" />);
    const projects = await screen.findByRole('region', { name: 'Projects' });
    expect(projects).toHaveTextContent('Sections: Execution (Lead carpenter), Site Coordination');
  });
});
