import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import fr from '../../i18n/fr.json';
import SettingsPanel from './SettingsPanel.svelte';

function setup(newPerDay = 5, onNewPerDayChange = vi.fn(() => Promise.resolve())) {
  render(SettingsPanel, { newPerDay, onNewPerDayChange });
  return { onNewPerDayChange, user: userEvent.setup() };
}

const quota = () => screen.getByRole('combobox', { name: fr.settings.newPerDay });

describe('SettingsPanel', () => {
  it('offers the daily quotas of new words, the current one selected, with advice', () => {
    setup();

    expect(screen.getByRole('heading', { name: fr.settings.title })).toBeVisible();
    expect(quota()).toHaveValue('5');
    expect(screen.getAllByRole('option').map((option) => option.textContent.trim())).toEqual([
      '3',
      '5',
      '8',
      '10',
      '15',
      '20',
      '30',
    ]);
    expect(quota()).toHaveAccessibleDescription(fr.settings.newPerDayHelp);
  });

  it('saves a new quota and says so politely', async () => {
    const { user, onNewPerDayChange } = setup();

    await user.selectOptions(quota(), '10');

    expect(onNewPerDayChange).toHaveBeenCalledWith(10);
    expect(await screen.findByText(fr.settings.saved)).toBeVisible();
    expect(screen.getByText(fr.settings.saved).closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('keeps a stored quota that is not among the choices, such as one from a backup', () => {
    setup(12);

    expect(quota()).toHaveValue('12');
  });

  it('tells when the quota could not be saved', async () => {
    const { user } = setup(
      5,
      vi.fn(() => Promise.reject(new Error('blocked'))),
    );

    await user.selectOptions(quota(), '8');

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.settings.saveFailed);
  });
});

describe('SettingsPanel, expert setting of the photo import', () => {
  it('lets the learner always see the zones of a photo before its words, off by default', async () => {
    const onPhotoZonesAlwaysChange = vi.fn(() => Promise.resolve());
    render(SettingsPanel, {
      newPerDay: 5,
      onNewPerDayChange: vi.fn(() => Promise.resolve()),
      photoZonesAlways: false,
      onPhotoZonesAlwaysChange,
    });
    const user = userEvent.setup();
    const expert = screen.getByRole('checkbox', { name: fr.settings.photoZonesAlways });
    expect(expert).not.toBeChecked();
    expect(expert).toHaveAccessibleDescription(fr.settings.photoZonesAlwaysHelp);

    await user.click(expert);

    expect(onPhotoZonesAlwaysChange).toHaveBeenCalledWith(true);
    expect(await screen.findByText(fr.settings.saved)).toBeVisible();
  });
});
