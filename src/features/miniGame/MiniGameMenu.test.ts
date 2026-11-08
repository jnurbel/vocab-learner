import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import { card } from '../flashcards/flashcards.fixtures';
import { fakeSpeaker } from './miniGame.fixtures';
import MiniGameMenu from './MiniGameMenu.svelte';

const words: Card[] = [
  card('time', undefined, { term: '时间', pinyin: 'shíjiān', example: '我没有时间吃饭。' }),
  card('cat', undefined, { term: '猫', pinyin: 'māo' }),
  card('dog', undefined, { term: '狗', pinyin: 'gǒu' }),
  card('sheep', undefined, { language: 'en', term: 'sheep' }),
];

function setup(speaker = fakeSpeaker(true)) {
  const onOpen = vi.fn();
  render(MiniGameMenu, { cards: words, speaker, onOpen });
  return { onOpen, user: userEvent.setup() };
}

const list = () => screen.getByRole('list', { name: 'Liste des mini-jeux' });
const item = (name: string) =>
  within(list())
    .getAllByRole('listitem')
    .find((each) => within(each).queryByRole('heading', { name }) !== null);

describe('MiniGameMenu', () => {
  it('lists the five games with their eligible words, and opens one in the chosen language', async () => {
    const { user, onOpen } = setup();

    await vi.waitFor(() => {
      expect(within(list()).getAllByRole('listitem')).toHaveLength(5);
    });
    expect(item('Le mot dans la phrase')).toHaveTextContent('1 mot éligible');
    expect(item('Relier les deux rives')).toHaveTextContent('3 mots éligibles');
    const bridge = item('Relier les deux rives');
    if (bridge === undefined) {
      throw new Error('BridgeMatch is not listed');
    }
    await user.click(within(bridge).getByRole('button', { name: /Jouer/ }));

    expect(onOpen).toHaveBeenCalledWith('bridgeMatch', 'zh');
  });

  it('keeps a closed game visible but disabled, with the reason', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('radio', { name: 'Anglais' }));

    const shuffle = await vi.waitFor(() => {
      const found = item("Remettre la phrase dans l'ordre");
      if (found === undefined) {
        throw new Error('Not listed');
      }
      return found;
    });
    expect(within(shuffle).getByRole('button', { name: /Jouer/ })).toBeDisabled();
    expect(shuffle).toHaveTextContent("Ajoute des phrases d'exemple.");
    await vi.waitFor(() => {
      expect(item('Paires proches')).toBeDefined();
    });
  });

  it('hides the tone game when no voice can read the language', async () => {
    setup(fakeSpeaker(false));

    await vi.waitFor(() => {
      expect(within(list()).getAllByRole('listitem')).toHaveLength(4);
    });
    expect(item('Échos des tons')).toBeUndefined();
  });
});
