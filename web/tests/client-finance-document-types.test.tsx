import { render, screen, within } from '@testing-library/react';
import { DocumentsSection } from '../src/pages/documents-section';

// Feature 006 FR-041, OQ-42: project uploads offer eight types; vendor uploads keep the five Feature 003 types.
function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => json(200, [])));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function typeOptions(): string[] {
  return within(screen.getByLabelText('Document type'))
    .getAllByRole('option')
    .map((option) => option.textContent ?? '')
    .filter((label) => label !== 'Choose');
}

describe('document types by parent', () => {
  it('offers Quotation, Purchase order and Payment proof for project documents', async () => {
    render(<DocumentsSection parent="projects" parentId="p1" parentArchived={false} />);
    await screen.findByLabelText('Document type');
    expect(typeOptions()).toEqual(['Agreement', 'Drawing', 'Registration certificate', 'Photo', 'Other', 'Quotation', 'Purchase order', 'Payment proof']);
  });

  it('offers only the five Feature 003 types for vendor documents', async () => {
    render(<DocumentsSection parent="vendors" parentId="v1" parentArchived={false} />);
    await screen.findByLabelText('Document type');
    expect(typeOptions()).toEqual(['Agreement', 'Drawing', 'Registration certificate', 'Photo', 'Other']);
  });
});
