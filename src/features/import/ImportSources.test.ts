import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import fr from '../../i18n/fr.json';
import ImportSources from './ImportSources.svelte';

function setup() {
  render(ImportSources, {
    existingCards: [],
    existingLabels: [],
    loadPinyin: () => Promise.resolve((hanzi: string) => hanzi),
    loadIgnoredTerms: () => Promise.resolve([]),
    newId: () => 'id',
    clock: () => '2026-11-10T12:00:00.000Z',
    onSave: vi.fn(() => Promise.resolve()),
    loadRecognizer: () => Promise.reject(new Error('not used')),
    preparePhoto: () => Promise.reject(new Error('not used')),
  });
  return userEvent.setup();
}

describe('ImportSources', () => {
  it('opens on the import from a text', () => {
    setup();

    expect(screen.getByRole('tab', { name: fr.importSources.tabs.text })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel', { name: fr.importSources.tabs.text })).toContainElement(
      screen.getByLabelText(fr.textImport.inputLabel),
    );
  });

  it('moves between the sources with the arrow keys, focusing the tab chosen', async () => {
    const user = setup();

    await user.click(screen.getByRole('tab', { name: fr.importSources.tabs.text }));
    await user.keyboard('{ArrowRight}');

    const csv = screen.getByRole('tab', { name: fr.importSources.tabs.csv });
    expect(csv).toHaveFocus();
    expect(csv).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('tab', { name: fr.importSources.tabs.photo })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: fr.importSources.tabs.text })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: fr.importSources.tabs.photo })).toHaveFocus();
  });

  it('offers to read a photo in its own tab', async () => {
    const user = setup();

    await user.click(screen.getByRole('tab', { name: fr.importSources.tabs.photo }));

    expect(screen.getByRole('tabpanel', { name: fr.importSources.tabs.photo })).toContainElement(
      screen.getByLabelText(fr.photoImport.fileLabel),
    );
  });

  it('keeps only the selected tab in the tab order', () => {
    setup();

    expect(screen.getByRole('tab', { name: fr.importSources.tabs.text })).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(screen.getByRole('tab', { name: fr.importSources.tabs.csv })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });
});
