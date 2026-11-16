import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import GapFill from './GapFill.svelte';
import { startGapFillSession } from './gapFillSession';
import { fakeSpeaker } from './miniGame.fixtures';
import type { MiniGameSelection } from './miniGameRecorder';
import { bankSentence, sentenceResources } from './sentence.fixtures';

const morning = new Date('2026-11-06T08:00:00Z');
const friend = card('friend', undefined, { term: '朋友', pinyin: 'péngyou', translation: 'ami' });
const others = [
  card('cat', undefined, { term: '猫', pinyin: 'māo', translation: 'chat' }),
  card('dog', undefined, { term: '狗', pinyin: 'gǒu', translation: 'chien' }),
  card('bird', undefined, { term: '鸟', pinyin: 'niǎo', translation: 'oiseau' }),
];
const words: Card[] = [friend, ...others];
const resources = sentenceResources([bankSentence(6, '我 的 朋友 来 了 。', 'Mon ami est venu.')]);

function setup({ level = 2, voice = true }: { level?: 1 | 2 | 3; voice?: boolean } = {}) {
  const store = new FakeStore({ reviewStates: words.map(({ id }) => reviewed(id)) });
  store.progress = { gameLevels: { 'gapFill:zh': { level, window: [] } } };
  const speaker = fakeSpeaker(voice);
  const onSessionEnd = vi.fn();
  const startSession = vi.fn((selection: MiniGameSelection) =>
    startGapFillSession(selection, {
      store,
      srs,
      clock: () => morning,
      newId: () => 'g1',
      loadSentences: () => Promise.resolve(resources),
      loadPinyin: () => Promise.resolve((hanzi: string) => hanzi),
    }),
  );
  render(GapFill, {
    cards: words,
    language: 'zh',
    speaker,
    speechRate: 0.7,
    startSession,
    onSessionEnd,
  });
  return { store, speaker, onSessionEnd, user: userEvent.setup() };
}

async function begin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Commencer' }));
  await screen.findByText('Phrases · 1 / 1');
}

describe('GapFill', () => {
  it('shows the bank sentence with a gap, and offers written words', async () => {
    const { user } = setup();
    await begin(user);

    expect(screen.getByRole('img', { name: 'mot manquant' })).toBeVisible();
    expect(screen.getByText(/我的/)).toHaveAttribute('lang', 'zh-CN');
    const options = screen.getByRole('group', { name: 'Quel mot manque dans la phrase ?' });
    expect(within(options).getByRole('button', { name: /朋友/ })).toBeVisible();
    expect(within(options).queryByRole('button', { name: /我/ })).toBeNull();
  });

  it('folds the translation, and the T key unfolds it', async () => {
    const { user } = setup();
    await begin(user);
    const details = screen.getByText('Voir la traduction').closest('details');

    expect(details).not.toHaveAttribute('open');
    await user.keyboard('t');
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('Mon ami est venu.')).toBeVisible();
  });

  it('shows the whole sentence, reads it and credits Tatoeba after a right choice', async () => {
    const { user, speaker, store, onSessionEnd } = setup();
    await begin(user);

    await user.keyboard(
      String(
        within(screen.getByRole('group', { name: 'Quel mot manque dans la phrase ?' }))
          .getAllByRole('button')
          .findIndex((button) => button.textContent.includes('朋友')) + 1,
      ),
    );

    const feedback = await screen.findByRole('status');
    expect(feedback).toHaveTextContent('Juste.');
    expect(within(feedback).getByText('朋友', { selector: 'mark' })).toBeVisible();
    expect(feedback).toHaveTextContent('Phrase : Tatoeba n° 6 par sysko');
    expect(speaker.speak).toHaveBeenCalledWith('我的朋友来了。', 'zh', { rate: 0.7 });
    expect(store.answers[0]?.result).toMatchObject({ exercise: 'gapFill', outcome: 'correct' });

    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByText('Phrases à trous')).toBeVisible();
    expect(onSessionEnd).toHaveBeenCalled();
  });

  it('tells the right word after "Je ne sais pas", and waits for Continue', async () => {
    const { user } = setup();
    await begin(user);

    await user.keyboard('0');

    const feedback = await screen.findByRole('status');
    expect(feedback).toHaveTextContent('C’était 朋友');
    expect(feedback).toHaveTextContent('Tu as répondu « Je ne sais pas ».');
    expect(screen.getByRole('button', { name: 'Continuer' })).toHaveFocus();
  });

  it('asks to type the word at level 3, ignoring Enter during an IME composition', async () => {
    const { user, store } = setup({ level: 3 });
    await begin(user);
    const field = screen.getByRole('textbox', { name: 'Tape le mot qui manque' });

    await user.type(field, '朋友');
    await fireEvent.compositionStart(field);
    await fireEvent.keyDown(field, { key: 'Enter' });
    expect(store.answers).toEqual([]);
    await fireEvent.compositionEnd(field);
    await user.click(screen.getByRole('button', { name: 'Indice' }));
    expect(screen.getByText('Pinyin : péngyou')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Indice' }));
    expect(screen.getByText('Premier caractère : 朋')).toBeVisible();
    await user.type(field, '{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent('Juste.');
    expect(store.answers[0]?.result).toMatchObject({ outcome: 'correctWithHint', hintsUsed: 2 });
  });

  it('reads nothing without a voice', async () => {
    const { user, speaker } = setup({ voice: false });
    await begin(user);

    await user.keyboard('0');

    await screen.findByRole('status');
    expect(speaker.speak).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Réécouter la phrase' })).toBeNull();
  });

  it('says when no sentence can ask the words', async () => {
    const store = new FakeStore();
    render(GapFill, {
      cards: others,
      language: 'zh',
      speaker: fakeSpeaker(true),
      speechRate: 0.7,
      startSession: (selection: MiniGameSelection) =>
        startGapFillSession(selection, {
          store,
          srs,
          clock: () => morning,
          newId: () => 'g2',
          loadPinyin: () => Promise.resolve((hanzi: string) => hanzi),
        }),
      onSessionEnd: vi.fn(),
      onExit: vi.fn(),
    });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Commencer' }));

    expect(await screen.findByText(/Ajoute des phrases d’exemple/)).toBeVisible();
  });

  it('says when the round cannot start', async () => {
    render(GapFill, {
      cards: words,
      language: 'zh',
      speaker: fakeSpeaker(true),
      speechRate: 0.7,
      startSession: () => Promise.reject(new Error('no database')),
      onSessionEnd: vi.fn(),
    });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Commencer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Le mini-jeu n’a pas pu démarrer.');
  });
});
