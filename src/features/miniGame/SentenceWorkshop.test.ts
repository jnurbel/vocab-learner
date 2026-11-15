import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import fr from '../../i18n/fr.json';
import { card, FakeStore, srs } from '../flashcards/flashcards.fixtures';
import type { MiniGameSelection } from './miniGameRecorder';
import { bankSentence, sentenceResources } from './sentence.fixtures';
import SentenceWorkshop from './SentenceWorkshop.svelte';
import { startSentenceWorkshopSession } from './sentenceWorkshopSession';

const morning = new Date('2026-11-06T08:00:00Z');
const friend = card('friend', undefined, { term: '朋友', pinyin: 'péngyou', translation: 'ami' });
const book = card('book', undefined, { term: '书', pinyin: 'shū', translation: 'livre' });
const words: Card[] = [friend, book];
const resources = sentenceResources([bankSentence(6, '我 的 朋友 来 了 。', 'Mon ami est venu.')]);

function setup({ offline = false } = {}) {
  const store = new FakeStore();
  const keepExample = vi.fn(() => Promise.resolve());
  const copyText = vi.fn(() => Promise.resolve());
  const onSessionEnd = vi.fn();
  render(SentenceWorkshop, {
    cards: words,
    startSession: (selection: MiniGameSelection) =>
      startSentenceWorkshopSession(
        { ...selection, cardIds: ['friend'] },
        {
          store,
          srs,
          clock: () => morning,
          newId: () => 'w1',
          loadSentences: () =>
            offline ? Promise.reject(new Error('offline')) : Promise.resolve(resources),
          keepExample,
        },
      ),
    onSessionEnd,
    onExit: vi.fn(),
    copyText,
  });
  return { store, keepExample, copyText, onSessionEnd, user: userEvent.setup() };
}

async function begin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Commencer' }));
  return screen.findByRole('textbox', { name: 'Ta phrase avec 朋友' });
}

describe('SentenceWorkshop', () => {
  it('shows the word to use, with its pinyin and meaning', async () => {
    const { user } = setup();
    await begin(user);

    expect(screen.getByText('朋友', { selector: '.hanzi' })).toHaveAttribute('lang', 'zh-CN');
    expect(screen.getByText('ami')).toBeVisible();
  });

  it('never says that a sentence is right: without error found, it asks to compare', async () => {
    const { user } = setup();
    const field = await begin(user);

    await user.type(field, '我的朋友很高。');
    await user.click(screen.getByRole('button', { name: 'Vérifier' }));

    const results = screen.getByRole('status');
    expect(results).toHaveTextContent(
      'Aucune erreur fréquente trouvée. Compare avec la phrase modèle.',
    );
    expect(results).toHaveTextContent('我的朋友来了。');
    expect(results).toHaveTextContent('Phrase : Tatoeba n° 6');
    expect(document.body.textContent).not.toMatch(/phrase correcte/i);
  });

  it('underlines and cites the faulty words, with a correction', async () => {
    const { user } = setup();
    const field = await begin(user);

    await user.type(field, '我的朋友是高。{Enter}');

    const results = screen.getByRole('status');
    expect(within(results).getByText('是高', { selector: 'u' })).toBeVisible();
    expect(results).toHaveTextContent('Devant un adjectif seul, on met 很, pas 是 : 是高.');
    expect(results).toHaveTextContent('Proposition : 我的朋友很高');
  });

  it('checks nothing while the input method composes', async () => {
    const { user } = setup();
    const field = await begin(user);
    await user.type(field, '我的朋友很高');

    await fireEvent.compositionStart(field);
    await fireEvent.keyDown(field, { key: 'Enter' });

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('tells a missing word, a sentence too short and characters that are not hanzi', async () => {
    const { user } = setup();
    const field = await begin(user);

    await user.type(field, 'ab{Enter}');

    const results = screen.getByRole('status');
    expect(results).toHaveTextContent('Le mot 朋友 n’est pas dans ta phrase.');
    expect(results).toHaveTextContent('Ta phrase est trop courte');
    expect(results).toHaveTextContent('Écris ta phrase en hanzi : a b n’en sont pas.');
  });

  it('asks about a 吗 with a question word without calling it a mistake', async () => {
    const { user } = setup();
    const field = await begin(user);

    await user.type(field, '谁是你的朋友吗？{Enter}');

    const results = screen.getByRole('status');
    expect(results).toHaveTextContent('À vérifier');
    expect(results).not.toHaveTextContent('À corriger');
  });

  it('keeps a sentence as the example of the word, then rewards it with a banner', async () => {
    const { user, keepExample, store, copyText, onSessionEnd } = setup();
    const field = await begin(user);
    await user.type(field, '我的朋友很高。{Enter}');

    await user.click(screen.getByRole('button', { name: 'Garder comme exemple du mot' }));
    expect(keepExample).toHaveBeenCalledWith(friend, '我的朋友很高。');
    expect(await screen.findByText('Phrase gardée comme exemple de 朋友.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Ma phrase est juste' }));

    expect(await screen.findByText('1 phrase écrite.')).toBeVisible();
    expect(screen.getByText(fr.sentenceWorkshop.banner)).toBeVisible();
    expect(store.progress).toMatchObject({ xp: 15, sentenceBanners: 1 });
    expect(onSessionEnd).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Faire vérifier mes phrases' }));
    expect(copyText).toHaveBeenCalledWith(expect.stringContaining('1. (朋友) 我的朋友很高。'));
    expect(await screen.findByText('Consigne copiée.')).toBeVisible();
  });

  it('lets the learner choose another word of the list', async () => {
    const { user } = setup();
    await begin(user);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Choisir un autre mot de ta liste' }),
      'book',
    );

    expect(await screen.findByRole('textbox', { name: 'Ta phrase avec 书' })).toBeVisible();
  });

  it('says when the workshop cannot check sentences without its data', async () => {
    const { user } = setup({ offline: true });

    await user.click(screen.getByRole('button', { name: 'Commencer' }));

    expect(await screen.findByText(/L’atelier a besoin de mots chinois/)).toBeVisible();
  });

  it('keeps a sentence judged wrong without banner', async () => {
    const { user, store } = setup();
    const field = await begin(user);
    await user.type(field, '我的朋友是高。{Enter}');

    await user.click(screen.getByRole('button', { name: 'Je me suis trompé' }));

    expect(await screen.findByText('1 phrase écrite.')).toBeVisible();
    expect(screen.queryByText(fr.sentenceWorkshop.banner)).toBeNull();
    expect(store.progress).toMatchObject({ xp: 10 });
  });
});
