import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import MeasureWord from './MeasureWord.svelte';
import { startMeasureWordSession } from './measureWordSession';
import { fakeSpeaker } from './miniGame.fixtures';
import type { MiniGameSelection } from './miniGameRecorder';
import { sentenceResources } from './sentence.fixtures';

const morning = new Date('2026-11-06T08:00:00Z');
const book = card('book', undefined, { term: '书', pinyin: 'shū', translation: 'livre' });
const nouns: Card[] = [
  book,
  card('cat', undefined, { term: '猫', pinyin: 'māo', translation: 'chat' }),
  card('dog', undefined, { term: '狗', pinyin: 'gǒu', translation: 'chien' }),
  card('friend', undefined, { term: '朋友', pinyin: 'péngyou', translation: 'ami' }),
];

function setup(cards = nouns, cardIds?: string[]) {
  const store = new FakeStore({ reviewStates: nouns.map(({ id }) => reviewed(id)) });
  const speaker = fakeSpeaker(true);
  const onSessionEnd = vi.fn();
  render(MeasureWord, {
    cards,
    ...(cardIds === undefined ? {} : { cardIds }),
    speaker,
    speechRate: 0.7,
    startSession: (selection: MiniGameSelection) =>
      startMeasureWordSession(selection, {
        store,
        srs,
        clock: () => morning,
        newId: () => 'm1',
        loadSentences: () => Promise.resolve(sentenceResources()),
      }),
    onSessionEnd,
    onExit: vi.fn(),
  });
  return { store, speaker, onSessionEnd, user: userEvent.setup() };
}

const options = () => screen.getByRole('group', { name: 'Quel classificateur va dans le trou ?' });

describe('MeasureWord', () => {
  it('shows a determiner, a gap and the noun, with its pinyin and meaning', async () => {
    const { user } = setup(nouns, ['book']);

    await user.click(screen.getByRole('button', { name: 'Commencer' }));

    expect(await screen.findByRole('img', { name: 'classificateur manquant' })).toBeVisible();
    expect(screen.getByText('livre')).toBeVisible();
    expect(within(options()).getAllByRole('button')).toHaveLength(4);
    expect(within(options()).getByRole('button', { name: /本/ })).toBeVisible();
  });

  it('accepts the measure word of the table, reads the phrase and tells all right ones', async () => {
    const { user, speaker, store } = setup(nouns, ['book']);
    await user.click(screen.getByRole('button', { name: 'Commencer' }));

    await user.click(
      within(await screen.findByRole('group', { name: /classificateur/ })).getByRole('button', {
        name: /本/,
      }),
    );

    const feedback = await screen.findByRole('status');
    expect(feedback).toHaveTextContent('Juste.');
    expect(feedback).toHaveTextContent('Classificateurs justes pour 书 : 本');
    expect(speaker.speak).toHaveBeenCalledWith(expect.stringMatching(/本书$/), 'zh', { rate: 0.7 });
    expect(store.answers[0]?.result).toMatchObject({ exercise: 'measureWord', answer: '本' });
  });

  it('explains what a wrong measure word is for, and what the right one is for', async () => {
    const { user } = setup(nouns, ['book']);
    await user.click(screen.getByRole('button', { name: 'Commencer' }));
    const wrong = within(await screen.findByRole('group', { name: /classificateur/ }))
      .getAllByRole('button')
      .find((button) => !button.textContent.includes('本'));

    await user.click(wrong ?? document.body);

    const feedback = await screen.findByRole('status');
    expect(feedback).toHaveTextContent('Ce n’était pas le bon classificateur.');
    expect(feedback).toHaveTextContent('本 est pour les livres et les cahiers.');
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Classificateurs')).toBeVisible();
  });

  it('takes "Je ne sais pas" from the 0 key', async () => {
    const { user } = setup(nouns, ['book']);
    await user.click(screen.getByRole('button', { name: 'Commencer' }));
    await screen.findByRole('group', { name: /classificateur/ });

    await user.keyboard('0');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Tu as répondu « Je ne sais pas ».',
    );
  });

  it('says when too few nouns are in the table of measure words', async () => {
    const { user } = setup(nouns.slice(0, 2));

    await user.click(screen.getByRole('button', { name: 'Commencer' }));

    expect(await screen.findByText(/Il faut au moins 4 noms/)).toBeVisible();
  });
});
