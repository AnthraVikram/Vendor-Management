import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConfirmDialog } from '../src/ui/confirm-dialog';
import { Skeleton } from '../src/ui/skeleton';
import { Tooltip } from '../src/ui/tooltip';
import { canLeave, useUnsavedGuard } from '../src/ui/unsaved-guard';

// Feature 005 house components (research §14): FR-007, FR-039, FR-040, FR-043.

function DialogHarness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Archive vendor</button>
      <ConfirmDialog
        open={open}
        title="Archive Mehta Carpentry?"
        message="It will be hidden from active lists. Nothing is deleted, and it can be restored."
        confirmLabel="Archive"
        onConfirm={() => { setOpen(false); onConfirm(); }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

describe('ConfirmDialog (FR-043)', () => {
  it('names the record and the consequence, and confirms on the confirm button', async () => {
    const onConfirm = vi.fn();
    render(<DialogHarness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Archive vendor' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive Mehta Carpentry?' });
    expect(dialog).toHaveTextContent('Nothing is deleted, and it can be restored.');
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancels on Escape or Cancel and returns focus to the button that opened it', async () => {
    const onConfirm = vi.fn();
    render(<DialogHarness onConfirm={onConfirm} />);
    const opener = screen.getByRole('button', { name: 'Archive vendor' });
    await userEvent.click(opener);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();

    await userEvent.click(opener);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('Tooltip (FR-040)', () => {
  it('describes an icon-only control on hover and focus, and the control keeps its accessible name', async () => {
    render(<Tooltip label="Remove from project"><button type="button" aria-label="Remove from project">×</button></Tooltip>);
    const button = screen.getByRole('button', { name: 'Remove from project' });
    expect(button).toHaveAccessibleDescription('Remove from project');
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Remove from project');
  });
});

describe('Skeleton (FR-039)', () => {
  it('shows placeholder rows in a busy region named for what is loading', () => {
    render(<Skeleton label="Loading vendors" rows={3} />);
    const region = screen.getByLabelText('Loading vendors');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region.querySelectorAll('.skeleton-row')).toHaveLength(3);
  });
});

describe('useUnsavedGuard (FR-007)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lets staff leave freely when nothing is unsaved', () => {
    const confirm = vi.spyOn(window, 'confirm');
    renderHook(() => useUnsavedGuard(false));
    expect(canLeave()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before leaving with unsaved changes, and warns before the tab closes', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { unmount } = renderHook(() => useUnsavedGuard(true));
    expect(canLeave()).toBe(false);
    expect(canLeave()).toBe(true);
    expect(confirm).toHaveBeenCalledWith('You have unsaved changes. Leave without saving them?');

    const unload = new Event('beforeunload', { cancelable: true });
    act(() => { window.dispatchEvent(unload); });
    expect(unload.defaultPrevented).toBe(true);

    unmount();
    expect(canLeave()).toBe(true);
  });
});
