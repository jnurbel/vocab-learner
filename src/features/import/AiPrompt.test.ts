import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import fr from '../../i18n/fr.json';
import AiPrompt from './AiPrompt.svelte';

function setup(copyText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve())) {
  render(AiPrompt, { copyText });
  return { copyText, user: userEvent.setup() };
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(fr.aiPrompt.title));
}

describe('AiPrompt', () => {
  it('asks an AI for the CSV the CSV import reads, with tone marks and senses split by "/"', () => {
    expect(fr.aiPrompt.prompt).toContain('terme;pinyin;sens;exemple;labels');
    expect(fr.aiPrompt.prompt).toContain('accents des tons');
    expect(fr.aiPrompt.prompt).toContain('« / »');
  });

  it('shows the prompt, to read or select by hand, and asks for a parent first', async () => {
    const { user } = setup();
    await open(user);

    expect(screen.getByLabelText(fr.aiPrompt.promptLabel)).toHaveValue(fr.aiPrompt.prompt);
    expect(screen.getByText(fr.aiPrompt.consent)).toBeVisible();
  });

  it('copies the prompt', async () => {
    const { user, copyText } = setup();
    await open(user);

    await user.click(screen.getByRole('button', { name: fr.aiPrompt.copy }));

    expect(copyText).toHaveBeenCalledWith(fr.aiPrompt.prompt);
    expect(screen.getByRole('status')).toHaveTextContent(fr.aiPrompt.copied);
  });

  it('says when the copy failed, so that it is done by hand', async () => {
    const { user } = setup(vi.fn(() => Promise.reject(new Error('denied'))));
    await open(user);

    await user.click(screen.getByRole('button', { name: fr.aiPrompt.copy }));

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.aiPrompt.copyFailed);
  });
});
