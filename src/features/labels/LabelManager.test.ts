import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { Label } from '../../domain/label';
import { format } from '../../i18n/format';
import fr from '../../i18n/fr.json';
import type { ShareOutcome } from '../../services/pack/shareFile';
import LabelManager from './LabelManager.svelte';

const now = '2026-11-06T09:00:00.000Z';
const before = '2026-01-01T00:00:00.000Z';

function label(id: string, name: string): Label {
  return { id, name, isFocus: false, createdAt: before, updatedAt: before };
}

function card(id: string, labelIds: string[]): Card {
  return {
    id,
    language: 'zh',
    term: id,
    translation: id,
    labelIds,
    source: 'manual',
    createdAt: before,
    updatedAt: before,
  };
}

const lesson = label('lesson', 'Leçon 3');
const animals = label('animals', 'Animaux');
const cat = card('猫', ['lesson', 'animals']);
const dog = card('狗', ['animals']);

function setup(labels: Label[] = [lesson, animals], cards: Card[] = [cat, dog]) {
  const onChange = vi.fn(() => Promise.resolve());
  render(LabelManager, { labels, cards, clock: () => now, onChange });
  return { onChange, user: userEvent.setup() };
}

function rowOf(name: string): HTMLElement {
  const table = screen.getByRole('table', { name: fr.labelManager.caption });
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByRole('rowheader', { name }) !== null);
  if (row === undefined) {
    throw new Error(`No row for ${name}`);
  }
  return row;
}

describe('LabelManager', () => {
  it('shows the mastery gauge of each label in each language it has words in', () => {
    render(LabelManager, {
      labels: [lesson, animals],
      cards: [cat, dog],
      clock: () => now,
      onChange: vi.fn(() => Promise.resolve()),
      masteryOf: (shown: Label) =>
        shown.id === 'animals'
          ? { zh: { mastered: 1, total: 2 }, en: { mastered: 0, total: 3 } }
          : {},
    });

    const row = screen.getByRole('row', { name: /Animaux/ });
    expect(within(row).getByText('Chinois : 1/2 mots maîtrisés')).toBeVisible();
    expect(within(row).getByText('Anglais : 0/3 mots maîtrisés')).toBeVisible();
    expect(
      within(row).getByRole('meter', { name: 'Chinois : 1/2 mots maîtrisés' }),
    ).toHaveAttribute('value', '1');
    const lessonRow = screen.getByRole('row', { name: /Leçon 3/ });
    expect(within(lessonRow).queryByRole('meter')).toBeNull();
  });

  it('lists the labels in alphabetical order with their number of words', () => {
    setup();

    const rowHeaders = screen.getAllByRole('rowheader').map((header) => header.textContent);
    expect(rowHeaders).toEqual(['Animaux', 'Leçon 3']);
    expect(rowOf('Animaux')).toHaveTextContent(format(fr.labelManager.count, { count: 2 }));
    expect(rowOf('Leçon 3')).toHaveTextContent(format(fr.labelManager.count, { count: 1 }));
  });

  it('says so when there is no label yet', () => {
    setup([], []);

    expect(screen.getByText(fr.labelManager.empty)).toBeVisible();
  });

  it('renames a label', async () => {
    const { user, onChange } = setup();

    await user.type(
      screen.getByLabelText(format(fr.labelManager.renameInput, { name: 'Leçon 3' })),
      'Leçon 3 : la ville',
    );
    await user.click(
      screen.getByRole('button', {
        name: format(fr.labelManager.renameLabel, { name: 'Leçon 3' }),
      }),
    );

    expect(onChange).toHaveBeenCalledWith({
      labels: [{ ...lesson, name: 'Leçon 3 : la ville', updatedAt: now }, animals],
      cardsToUpdate: [],
    });
  });

  it('refuses a name that another label already has', async () => {
    const { user, onChange } = setup();

    await user.type(
      screen.getByLabelText(format(fr.labelManager.renameInput, { name: 'Leçon 3' })),
      'animaux',
    );
    await user.click(
      screen.getByRole('button', {
        name: format(fr.labelManager.renameLabel, { name: 'Leçon 3' }),
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(fr.labelManager.errors.nameTaken);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('merges a label into another once confirmed: the words keep both lessons in one label', async () => {
    const { user, onChange } = setup();

    await user.selectOptions(
      screen.getByLabelText(format(fr.labelManager.mergeSelect, { name: 'Animaux' })),
      'Leçon 3',
    );
    await user.click(
      screen.getByRole('button', { name: format(fr.labelManager.mergeLabel, { name: 'Animaux' }) }),
    );
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: fr.labelManager.confirmMergeButton }));

    expect(onChange).toHaveBeenCalledWith({
      labels: [lesson],
      cardsToUpdate: [
        { ...cat, labelIds: ['lesson'], updatedAt: now },
        { ...dog, labelIds: ['lesson'], updatedAt: now },
      ],
      merged: { sourceId: 'animals', targetId: 'lesson' },
    });
  });

  it('cannot merge before a target label is chosen', () => {
    setup();

    expect(
      screen.getByRole('button', { name: format(fr.labelManager.mergeLabel, { name: 'Animaux' }) }),
    ).toBeDisabled();
  });

  it('deletes a label once confirmed, keeping its words', async () => {
    const { user, onChange } = setup();

    await user.click(
      screen.getByRole('button', {
        name: format(fr.labelManager.deleteLabel, { name: 'Animaux' }),
      }),
    );
    expect(
      screen.getByText(format(fr.labelManager.confirmDelete, { name: 'Animaux', count: 2 })),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.labelManager.confirmDeleteButton }));

    expect(onChange).toHaveBeenCalledWith({
      labels: [lesson],
      cardsToUpdate: [
        { ...cat, labelIds: ['lesson'], updatedAt: now },
        { ...dog, labelIds: [], updatedAt: now },
      ],
    });
  });

  it('says so when a change cannot be saved', async () => {
    const { user, onChange } = setup();
    onChange.mockRejectedValueOnce(new Error('quota'));

    await user.type(
      screen.getByLabelText(format(fr.labelManager.renameInput, { name: 'Animaux' })),
      'Bêtes',
    );
    await user.click(
      screen.getByRole('button', {
        name: format(fr.labelManager.renameLabel, { name: 'Animaux' }),
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.labelManager.saveFailed);
  });

  describe('labels to work on', () => {
    const today = '2026-11-07';

    function setupFocus(labels: Label[] = [lesson, animals]) {
      const onChange = vi.fn(() => Promise.resolve());
      render(LabelManager, { labels, cards: [cat, dog], clock: () => now, today, onChange });
      return { onChange, user: userEvent.setup() };
    }

    it('pins a label with a toggle button', async () => {
      const { onChange, user } = setupFocus();
      const pin = within(rowOf('Leçon 3')).getByRole('button', { name: 'Épingler Leçon 3' });
      expect(pin).toHaveAttribute('aria-pressed', 'false');

      await user.click(pin);

      expect(onChange).toHaveBeenCalledWith({
        labels: [{ ...lesson, isFocus: true, updatedAt: now }, animals],
        cardsToUpdate: [],
      });
    });

    it('unpins a pinned label', async () => {
      const pinned = { ...lesson, isFocus: true };
      const { onChange, user } = setupFocus([pinned, animals]);
      const unpin = within(rowOf('Leçon 3')).getByRole('button', { name: 'Désépingler Leçon 3' });
      expect(unpin).toHaveAttribute('aria-pressed', 'true');

      await user.click(unpin);

      expect(onChange).toHaveBeenCalledWith({
        labels: [{ ...pinned, isFocus: false, updatedAt: now }, animals],
        cardsToUpdate: [],
      });
    });

    it('sets a test date, from today to a year ahead, which pins the label', async () => {
      const { onChange } = setupFocus();
      const date = within(rowOf('Leçon 3')).getByLabelText('Date du contrôle de Leçon 3');
      expect(date).toHaveAttribute('type', 'date');
      expect(date).toHaveAttribute('min', today);
      expect(date).toHaveAttribute('max', '2027-11-07');

      await fireEvent.change(date, { target: { value: '2026-11-13' } });

      expect(onChange).toHaveBeenCalledWith({
        labels: [{ ...lesson, isFocus: true, examDate: '2026-11-13', updatedAt: now }, animals],
        cardsToUpdate: [],
      });
      expect(await screen.findByRole('status')).toHaveTextContent(fr.labelManager.saved);
    });

    it('refuses a test date in the past and saves nothing', async () => {
      const { onChange } = setupFocus();
      const date = within(rowOf('Leçon 3')).getByLabelText('Date du contrôle de Leçon 3');

      await fireEvent.change(date, { target: { value: '2026-11-01' } });

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(fr.labelManager.examErrors.pastDate);
    });

    it('removes the test date when the field is emptied', async () => {
      const dated = { ...lesson, isFocus: true, examDate: '2026-11-13' };
      const { onChange } = setupFocus([dated, animals]);
      const date = within(rowOf('Leçon 3')).getByLabelText('Date du contrôle de Leçon 3');
      expect(date).toHaveValue('2026-11-13');

      await fireEvent.change(date, { target: { value: '' } });

      expect(onChange).toHaveBeenCalledWith({
        labels: [{ ...lesson, isFocus: true, updatedAt: now }, animals],
        cardsToUpdate: [],
      });
    });

    it('hides the pin and the test date when the learner day is not known', () => {
      setup();

      expect(screen.queryByRole('button', { name: /Épingler/ })).toBeNull();
      expect(screen.queryByLabelText(/Date du contrôle/)).toBeNull();
    });
  });

  it('opens the path of a pinned label, and only of a pinned one', async () => {
    const onOpenPath = vi.fn();
    render(LabelManager, {
      labels: [{ ...lesson, isFocus: true }, animals],
      cards: [cat, dog],
      clock: () => now,
      onChange: vi.fn(() => Promise.resolve()),
      onOpenPath,
    });

    await userEvent
      .setup()
      .click(within(rowOf('Leçon 3')).getByRole('button', { name: 'Voir le parcours de Leçon 3' }));

    expect(onOpenPath).toHaveBeenCalledWith(expect.objectContaining({ id: 'lesson' }));
    expect(within(rowOf('Animaux')).queryByRole('button', { name: /parcours/ })).toBeNull();
  });
});

describe('LabelManager sharing', () => {
  function setupSharing(outcome: Promise<ShareOutcome> = Promise.resolve('shared')) {
    const onShare = vi.fn(() => outcome);
    render(LabelManager, {
      labels: [lesson, animals],
      cards: [cat, dog],
      clock: () => now,
      onChange: vi.fn(() => Promise.resolve()),
      onShare,
    });
    return { onShare, user: userEvent.setup() };
  }

  it('shares one label as a pack', async () => {
    const { onShare, user } = setupSharing();

    await user.click(within(rowOf('Animaux')).getByRole('button', { name: 'Partager Animaux' }));

    expect(onShare).toHaveBeenCalledWith(['animals']);
    expect(await screen.findByRole('status')).toHaveTextContent(fr.labelManager.shared);
  });

  it('shares several chosen labels together as one pack', async () => {
    const { onShare, user } = setupSharing();
    const shareChosen = screen.getByRole('button', { name: /Partager la sélection/ });
    expect(shareChosen).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Choisir Leçon 3 pour le partage' }));
    await user.click(screen.getByRole('checkbox', { name: 'Choisir Animaux pour le partage' }));
    expect(shareChosen).toHaveAccessibleName('Partager la sélection (2 labels)');
    await user.click(shareChosen);

    expect(onShare).toHaveBeenCalledWith(['animals', 'lesson']);
  });

  it('says the pack was downloaded where the device cannot share it', async () => {
    const { user } = setupSharing(Promise.resolve('downloaded'));

    await user.click(within(rowOf('Animaux')).getByRole('button', { name: 'Partager Animaux' }));

    expect(await screen.findByRole('status')).toHaveTextContent(fr.labelManager.downloaded);
  });

  it('says nothing when the learner closes the share sheet', async () => {
    const { onShare, user } = setupSharing(Promise.resolve('cancelled'));

    await user.click(within(rowOf('Animaux')).getByRole('button', { name: 'Partager Animaux' }));

    expect(onShare).toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when the sharing fails', async () => {
    const { user } = setupSharing(Promise.reject(new Error('boom')));

    await user.click(within(rowOf('Animaux')).getByRole('button', { name: 'Partager Animaux' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.labelManager.shareFailed);
  });

  it('hides the sharing without a way to share', () => {
    setup();

    expect(screen.queryByRole('button', { name: /Partager/ })).toBeNull();
  });
});
