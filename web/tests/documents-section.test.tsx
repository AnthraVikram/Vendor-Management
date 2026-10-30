import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentsSection } from '../src/pages/documents-section';

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const asha = { id: 'u1', name: 'Asha Admin' };
const active = {
  id: 'd1', vendor_id: 'v1', project_id: null, title: 'Rate agreement 2026', document_type: 'AGREEMENT', note: 'Signed copy',
  original_filename: 'agreement.pdf', media_type: 'application/pdf', byte_size: 182344, archived: false,
  created_at: '2026-10-29T06:00:00.000Z', created_by: asha,
};
const archived = {
  ...active, id: 'd2', title: 'Old drawing', document_type: 'DRAWING', note: null, original_filename: 'old.png',
  media_type: 'image/png', byte_size: 512, archived: true, created_at: '2026-10-20T06:00:00.000Z',
};

type Reply = ReturnType<typeof json>;

function mockFetch(onPost?: (url: string, init: RequestInit) => Reply) {
  const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') return onPost ? onPost(url, init) : json(200, active);
    if (url === '/api/vendors/v1/documents') return json(200, [active]);
    if (url === '/api/vendors/v1/documents?include_archived=true') return json(200, [active, archived]);
    return json(404, { message: 'Not found.' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function documentList() {
  return screen.findByRole('list', { name: 'Documents' });
}

function expectNoDeleteControl() {
  expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  expect(screen.queryByRole('link', { name: /delete/i })).toBeNull();
}

describe('documents section', () => {
  it('lists each document with its title, type, file name, size, uploader, and time, and a download link', async () => {
    mockFetch();
    render(<DocumentsSection parent="vendors" parentId="v1" parentArchived={false} />);
    const items = within(await documentList()).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item).toHaveTextContent('Rate agreement 2026');
    expect(item).toHaveTextContent('Agreement');
    expect(item).toHaveTextContent('agreement.pdf');
    expect(item).toHaveTextContent('178.1 KB');
    expect(item).toHaveTextContent('Asha Admin');
    expect(item).toHaveTextContent('2026-10-29');
    expect(item).toHaveTextContent('Signed copy');
    expect(within(item).getByRole('link', { name: 'Download agreement.pdf' })).toHaveAttribute('href', '/api/documents/d1/file');
  });

  it('adds include_archived=true when "Show archived" is ticked, marks archived documents, and offers restore', async () => {
    const fetchMock = mockFetch();
    render(<DocumentsSection parent="vendors" parentId="v1" parentArchived={false} />);
    await documentList();
    await userEvent.click(screen.getByLabelText('Show archived'));
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain('/api/vendors/v1/documents?include_archived=true');
    const items = await within(await documentList()).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent('Archived');
    expect(within(items[0]).getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(within(items[1]).getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(within(items[1]).getByRole('link', { name: 'Download old.png' })).toHaveAttribute('href', '/api/documents/d2/file');
  });

  it('posts archive and restore to the document routes', async () => {
    const posts: string[] = [];
    mockFetch((url) => {
      posts.push(url);
      return json(200, active);
    });
    render(<DocumentsSection parent="vendors" parentId="v1" parentArchived={false} />);
    await documentList();
    await userEvent.click(screen.getByLabelText('Show archived'));
    const items = await within(await documentList()).findAllByRole('listitem');
    await userEvent.click(within(items[0]).getByRole('button', { name: 'Archive' }));
    await userEvent.click(within(items[1]).getByRole('button', { name: 'Restore' }));
    expect(posts).toEqual(['/api/documents/d1/archive', '/api/documents/d2/restore']);
  });

  it('uploads the file, title, type, and note to the parent record', async () => {
    let sent: FormData | undefined;
    let sentTo = '';
    mockFetch((url, init) => {
      sentTo = url;
      sent = init.body as FormData;
      return json(201, active);
    });
    render(<DocumentsSection parent="projects" parentId="p1" parentArchived={false} />);
    const file = new File(['%PDF-1.4'], 'plan.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('File'), file);
    await userEvent.type(screen.getByLabelText('Title'), 'Floor plan');
    await userEvent.selectOptions(screen.getByLabelText('Document type'), 'DRAWING');
    await userEvent.type(screen.getByLabelText('Note'), 'Rev B');
    await userEvent.click(screen.getByRole('button', { name: 'Upload document' }));
    expect(sentTo).toBe('/api/projects/p1/documents');
    expect(sent).toBeInstanceOf(FormData);
    expect((sent!.get('file') as File).name).toBe('plan.pdf');
    expect(sent!.get('title')).toBe('Floor plan');
    expect(sent!.get('document_type')).toBe('DRAWING');
    expect(sent!.get('note')).toBe('Rev B');
  });

  it('shows each 400 field message beside its field', async () => {
    mockFetch(() =>
      json(400, {
        message: 'Check the highlighted fields.',
        fields: { file: "The file's content does not match its type.", title: 'Title is required.', document_type: 'Choose a document type.' },
      }),
    );
    render(<DocumentsSection parent="vendors" parentId="v1" parentArchived={false} />);
    await userEvent.upload(screen.getByLabelText('File'), new File(['MZ'], 'setup.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Upload document' }));
    expect(await screen.findByText("The file's content does not match its type.")).toBeInTheDocument();
    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByText('Choose a document type.')).toBeInTheDocument();
    expect(screen.getByLabelText('File')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Document type')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the size message for a file over 25 MB', async () => {
    mockFetch(() => json(400, { message: 'Check the highlighted fields.', code: 'FILE_TOO_LARGE', fields: { file: 'The file must be 25 MB or smaller.' } }));
    render(<DocumentsSection parent="vendors" parentId="v1" parentArchived={false} />);
    await userEvent.upload(screen.getByLabelText('File'), new File(['x'], 'huge.pdf', { type: 'application/pdf' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Huge');
    await userEvent.click(screen.getByRole('button', { name: 'Upload document' }));
    expect(await screen.findByText('The file must be 25 MB or smaller.')).toBeInTheDocument();
  });

  it('hides upload, archive, and restore on an archived parent but keeps download links (US3-7)', async () => {
    mockFetch();
    render(<DocumentsSection parent="vendors" parentId="v1" parentArchived />);
    await documentList();
    await userEvent.click(screen.getByLabelText('Show archived'));
    const items = await within(await documentList()).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Upload document' })).toBeNull();
    expect(screen.queryByLabelText('File')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    expect(within(items[0]).getByRole('link', { name: 'Download agreement.pdf' })).toBeInTheDocument();
    expect(within(items[1]).getByRole('link', { name: 'Download old.png' })).toBeInTheDocument();
  });

  it('never shows a delete control, for active or archived documents on an active or archived parent (US3-6)', async () => {
    for (const parentArchived of [false, true]) {
      mockFetch();
      const { unmount } = render(<DocumentsSection parent="vendors" parentId="v1" parentArchived={parentArchived} />);
      await documentList();
      expectNoDeleteControl();
      await userEvent.click(screen.getByLabelText('Show archived'));
      expect(await within(await documentList()).findAllByRole('listitem')).toHaveLength(2);
      expectNoDeleteControl();
      unmount();
    }
  });

  it('says so when a record has no documents', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, [])));
    render(<DocumentsSection parent="projects" parentId="p1" parentArchived={false} />);
    expect(await screen.findByText('No documents yet.')).toBeInTheDocument();
  });
});
