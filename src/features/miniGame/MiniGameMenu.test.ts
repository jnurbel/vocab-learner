import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import { card } from '../flashcards/flashcards.fixtures';
import { fakeSpeaker } from './miniGame.fixtures';
import MiniGameMenu from './MiniGameMenu.svelte';
import { bankSentence, sentenceResources } from './sentence.fixtures';
import type { SentenceResources } from '../../services/sentence/sentenceLoader';

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

describe('MiniGameMenu with the sentence data', () => {
  it('loads the sentence data for Chinese, then counts the nouns of the measure words', async () => {
    let resolve: (resources: SentenceResources) => void = () => undefined;
    const loadSentences = vi.fn(
      () =>
        new Promise<SentenceResources>((done) => {
          resolve = done;
        }),
    );
    const nouns = ['书', '猫', '狗', '朋友'].map((term) => card(term, undefined, { term }));
    render(MiniGameMenu, {
      cards: nouns,
      speaker: fakeSpeaker(true),
      onOpen: vi.fn(),
      loadSentences,
    });

    expect(await screen.findByText('Chargement des phrases…')).toBeVisible();
    resolve(sentenceResources([bankSentence(1, '我 的 朋友 来 了 。')]));

    await vi.waitFor(() => {
      expect(item('Le bon classificateur')).toHaveTextContent('4 mots éligibles');
    });
    expect(item('La phrase à trous')).toHaveTextContent('1 mot éligible');
    expect(loadSentences).toHaveBeenCalledTimes(1);
  });

  it('tells that the sentence data could not be loaded', async () => {
    render(MiniGameMenu, {
      cards: words,
      speaker: fakeSpeaker(true),
      onOpen: vi.fn(),
      loadSentences: () => Promise.reject(new Error('offline')),
    });

    await vi.waitFor(() => {
      expect(item('Le bon classificateur')).toHaveTextContent(/connecte-toi une fois/);
    });
  });

  it('never loads the sentence data for English', async () => {
    const loadSentences = vi.fn(() => Promise.resolve(sentenceResources()));
    render(MiniGameMenu, {
      cards: words,
      speaker: fakeSpeaker(true),
      onOpen: vi.fn(),
      loadSentences,
      language: 'en',
    });

    await vi.waitFor(() => {
      expect(item('La phrase à trous')).toBeDefined();
    });
    expect(item('Le bon classificateur')).toBeUndefined();
    expect(loadSentences).not.toHaveBeenCalled();
  });
});

describe('MiniGameMenu', () => {
  it('lists the eight games with their eligible words, and opens one in the chosen language', async () => {
    const { user, onOpen } = setup();

    await vi.waitFor(() => {
      expect(within(list()).getAllByRole('listitem')).toHaveLength(8);
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
      expect(within(list()).getAllByRole('listitem')).toHaveLength(7);
    });
    expect(item('Échos des tons')).toBeUndefined();
  });
});
