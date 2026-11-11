import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Grid } from '../../domain/photo/tableGrid';
import { format } from '../../i18n/format';
import fr from '../../i18n/fr.json';
import ZoneEditor from './ZoneEditor.svelte';

// jsdom has no pointer capture: the browser keeps the pointer on the separator while dragging.
beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn();
});

const grid: Grid = {
  size: { width: 1000, height: 500 },
  columnSeparators: [100, 400],
  columnRoles: ['ignore', 'hanzi', 'meaning'],
  rowSeparators: [250],
};

function setup(options: { onBack?: () => void } = {}) {
  const onApply = vi.fn<(edited: Grid) => void>();
  render(ZoneEditor, { grid, photoUrl: 'blob:photo', onApply, ...options });
  return { onApply, user: userEvent.setup() };
}

const columnSeparator = (index: number) =>
  screen.getByRole('separator', { name: format(fr.photoZones.columnSeparator, { index }) });
const rowSeparator = (index: number) =>
  screen.getByRole('separator', { name: format(fr.photoZones.rowSeparator, { index }) });

describe('ZoneEditor', () => {
  it('shows the photo with the separators found over it, and the role of each column', () => {
    setup();

    expect(screen.getByRole('group', { name: fr.photoZones.photoLabel })).toBeVisible();
    expect(columnSeparator(1)).toHaveAttribute('aria-valuenow', '100');
    expect(columnSeparator(2)).toHaveAttribute('aria-orientation', 'vertical');
    expect(rowSeparator(1)).toHaveAttribute('aria-valuenow', '250');
    expect(
      screen.getByRole('combobox', { name: format(fr.photoZones.columnRole, { index: 1 }) }),
    ).toHaveValue('ignore');
  });

  it('goes on with the zones found in one tap when they are right', async () => {
    const { onApply, user } = setup();

    await user.click(screen.getByRole('button', { name: fr.photoZones.confirm }));

    expect(onApply).toHaveBeenCalledWith(grid);
  });

  it('moves a separator with the arrow keys, then reads again with the new zones', async () => {
    const { onApply, user } = setup();

    columnSeparator(2).focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(columnSeparator(2)).toHaveAttribute('aria-valuenow', '420');
    expect(screen.getByRole('status')).toHaveTextContent(
      format(fr.photoZones.moved, {
        separator: format(fr.photoZones.columnSeparator, { index: 2 }),
      }),
    );
    rowSeparator(1).focus();
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');

    await user.click(screen.getByRole('button', { name: fr.photoZones.reread }));
    expect(onApply).toHaveBeenCalledWith({
      ...grid,
      columnSeparators: [100, 420],
      rowSeparators: [200],
    });
  });

  it('moves a separator with a finger or the mouse', async () => {
    const { onApply, user } = setup();
    const svg = screen.getByRole('group', { name: fr.photoZones.photoLabel });
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 500, height: 250 }),
    );

    await fireEvent.pointerDown(columnSeparator(1), { pointerId: 1, clientX: 50, clientY: 10 });
    await fireEvent.pointerMove(columnSeparator(1), { pointerId: 1, clientX: 80, clientY: 10 });
    await fireEvent.pointerUp(columnSeparator(1), { pointerId: 1, clientX: 80, clientY: 10 });
    await fireEvent.pointerMove(columnSeparator(1), { pointerId: 1, clientX: 300, clientY: 10 });

    expect(columnSeparator(1)).toHaveAttribute('aria-valuenow', '160');
    await user.click(screen.getByRole('button', { name: fr.photoZones.reread }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ columnSeparators: [160, 400] }));
  });

  it('adds and removes separators, and gives a column another role', async () => {
    const { onApply, user } = setup();

    await user.click(screen.getByRole('button', { name: fr.photoZones.addColumn }));
    await user.click(screen.getByRole('button', { name: fr.photoZones.addRow }));
    expect(columnSeparator(3)).toHaveAttribute('aria-valuenow', '700');
    expect(rowSeparator(1)).toHaveAttribute('aria-valuenow', '125');

    rowSeparator(1).focus();
    await user.keyboard('{Delete}');
    await user.selectOptions(
      screen.getByRole('combobox', { name: format(fr.photoZones.columnRole, { index: 4 }) }),
      'pinyin',
    );

    await user.click(screen.getByRole('button', { name: fr.photoZones.reread }));
    expect(onApply).toHaveBeenCalledWith({
      size: grid.size,
      columnSeparators: [100, 400, 700],
      columnRoles: ['ignore', 'hanzi', 'meaning', 'pinyin'],
      rowSeparators: [250],
    });
  });

  it('removes the separator chosen last with a button, for touch screens', async () => {
    const { onApply, user } = setup();

    await user.click(columnSeparator(1));
    await user.click(screen.getByRole('button', { name: fr.photoZones.removeSelected }));

    await user.click(screen.getByRole('button', { name: fr.photoZones.reread }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ columnSeparators: [400], columnRoles: ['hanzi', 'meaning'] }),
    );
  });

  it('goes back to the words without change when it was opened from them', async () => {
    const onBack = vi.fn();
    const { user } = setup({ onBack });

    await user.click(screen.getByRole('button', { name: fr.photoZones.back }));

    expect(onBack).toHaveBeenCalledOnce();
  });
});
