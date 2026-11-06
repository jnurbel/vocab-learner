import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { Label } from '../../domain/label';
import type { StudyData } from '../../storage/studyRepository';
import fr from '../../i18n/fr.json';
import type { Speaker } from '../../services/tts/speaker';
import { startPracticeSession } from '../practice/practiceSession';
import { card, FakeStore, reviewed, srs } from './flashcards.fixtures';
import Flashcards from './Flashcards.svelte';
import { startFlashcardSession, type FlashcardSelection } from './flashcardSession';

const morning = new Date('2026-11-06T08:00:00Z');

function fakeSpeaker(withVoice = true) {
  return {
    hasVoice: vi.fn<Speaker['hasVoice']>(() => Promise.resolve(withVoice)),
    speak: vi.fn<Speaker['speak']>(() =>
      withVoice ? Promise.resolve() : Promise.reject(new Error('No voice')),
    ),
    cancel: vi.fn(),
  } satisfies Speaker;
}

const cat = card('cat', '2026-10-01T00:00:00.000Z', {
  term: '猫',
  pinyin: 'māo',
  translation: 'chat',
  example: '我有一只猫。',
  labelIds: ['animals'],
});
const dog = card('dog', '2026-10-02T00:00:00.000Z', {
  term: '狗',
  pinyin: 'gǒu',
  translation: 'chien',
});
const apple = card('apple', '2026-10-03T00:00:00.000Z', {
  language: 'en',
  term: 'apple',
  translation: 'pomme',
});
const animals: Label = {
  id: 'animals',
  name: 'Animaux',
  isFocus: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function setup({
  cards = [cat, dog, apple],
  data = {},
  speaker = fakeSpeaker(),
  onSessionEnd = vi.fn(),
}: {
  cards?: Card[];
  data?: Partial<StudyData>;
  speaker?: ReturnType<typeof fakeSpeaker>;
  onSessionEnd?: () => void;
} = {}) {
  const store = new FakeStore(data);
  const startSession = vi.fn((selection: FlashcardSelection) =>
    startFlashcardSession(selection, { store, srs, clock: () => morning, newId: () => 's1' }),
  );
  const startPractice = vi.fn((selection: FlashcardSelection) =>
    startPracticeSession(selection, { store, clock: () => morning, newId: () => 'p1' }),
  );
  render(Flashcards, {
    cards,
    labels: [animals],
    startSession,
    startPractice,
    speaker,
    onSessionEnd,
  });
  return { store, startSession, speaker, onSessionEnd, user: userEvent.setup() };
}

const region = () => screen.getByRole('region', { name: fr.flashcards.title });

describe('Flashcards', () => {
  it('starts a session on Chinese words by default, optionally filtered by labels', async () => {
    const { user, startSession } = setup();

    await user.click(screen.getByRole('checkbox', { name: 'Animaux' }));
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    expect(startSession).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'zh', labelIds: ['animals'] }),
    );
    expect(await screen.findByText('1 / 1')).toBeVisible();
  });

  it('plays the word without showing it when a voice exists, and replays it on demand', async () => {
    const { user, speaker } = setup();
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    expect(await screen.findByText(fr.flashcards.listenPrompt)).toBeVisible();
    expect(within(region()).queryByText('猫')).toBeNull();
    await vi.waitFor(() => {
      expect(speaker.speak).toHaveBeenCalledWith('猫', 'zh');
    });

    await user.click(screen.getByRole('button', { name: fr.flashcards.replay }));
    expect(speaker.speak).toHaveBeenCalledTimes(2);
  });

  it('shows the written word in Chinese when there is no voice', async () => {
    const { user } = setup({ speaker: fakeSpeaker(false) });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    expect(await screen.findByText(fr.flashcards.noVoice.zh)).toBeVisible();
    const word = within(region()).getByText('猫');
    expect(word).toHaveAttribute('lang', 'zh-CN');
    expect(screen.queryByRole('button', { name: fr.flashcards.replay })).toBeNull();
  });

  it('shows the written word when the voice fails to play', async () => {
    const speaker = fakeSpeaker();
    speaker.speak.mockRejectedValue(new Error('Speech failed'));
    const { user } = setup({ speaker });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    expect(await screen.findByText(fr.flashcards.audioError)).toBeVisible();
    expect(within(region()).getByText('猫')).toBeVisible();
  });

  it('turns the card over to show the word, its coloured pinyin, its meaning and example', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    await user.click(await screen.findByRole('button', { name: fr.flashcards.flip }));

    expect(within(region()).getByText('猫')).toHaveAttribute('lang', 'zh-CN');
    expect(within(region()).getByText('māo')).toBeVisible();
    expect(within(region()).getByText('chat')).toBeVisible();
    expect(within(region()).getByText('我有一只猫。')).toBeVisible();
  });

  it('rates the word, stores the answer and moves on to the next card', async () => {
    const { user, store } = setup({ data: { reviewStates: [reviewed('dog')] } });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    expect(await screen.findByText('1 / 2')).toBeVisible();

    await user.click(screen.getByRole('button', { name: fr.flashcards.flip }));
    expect(screen.queryByRole('button', { name: fr.flashcards.evaluations.known })).toBeNull();
    await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.good }));

    expect(await screen.findByText('2 / 2')).toBeVisible();
    expect(store.answers[0]?.result).toMatchObject({ cardId: 'dog', rating: 'good' });
    expect(screen.getByRole('status')).toHaveTextContent('Carte 2 sur 2');
  });

  it('counts the revealed pinyin as a hint, and offers "I already know it" for a new word', async () => {
    const { user, store } = setup({ cards: [cat] });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    await user.click(await screen.findByRole('button', { name: fr.flashcards.showPinyin }));
    expect(screen.getByText(fr.flashcards.hintUsed)).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.flashcards.flip }));
    await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.good }));

    expect(store.answers[0]?.result).toMatchObject({ hintsUsed: 1, rating: 'hard' });
  });

  it('records "I already know it" as an easy answer', async () => {
    const { user, store } = setup({ cards: [cat] });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    await user.click(await screen.findByRole('button', { name: fr.flashcards.flip }));

    await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.known }));

    expect(store.answers[0]?.result).toMatchObject({ rating: 'easy' });
  });

  it('is played with the keyboard: Space turns over, R replays, 1 2 3 rate', async () => {
    const { user, store, speaker } = setup({
      data: { reviewStates: [reviewed('cat'), reviewed('dog')] },
    });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    await screen.findByText('1 / 2');
    await vi.waitFor(() => {
      expect(speaker.speak).toHaveBeenCalledTimes(1);
    });

    await user.keyboard('r');
    expect(speaker.speak).toHaveBeenCalledTimes(2);
    await user.keyboard('1');
    expect(store.answers).toEqual([]); // not before the card is turned over
    await user.keyboard(' ');
    expect(within(region()).getByText('chat')).toBeVisible();
    await user.keyboard('1');

    expect(await screen.findByText('2 / 2')).toBeVisible();
    expect(store.answers[0]?.result).toMatchObject({ rating: 'again' });
    await user.keyboard(' ');
    await user.keyboard('3');
    expect(await screen.findByRole('heading', { name: fr.flashcards.summaryTitle })).toBeVisible();
  });

  it('ignores the shortcuts while typing in a field', async () => {
    const { user } = setup({ cards: [cat] });
    const outside = document.createElement('input');
    document.body.append(outside);
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    await screen.findByText('1 / 1');

    await user.click(outside);
    await user.keyboard(' ');

    expect(within(region()).queryByText('chat')).toBeNull();
    outside.remove();
  });

  it('ends with the words reviewed, the new words and those that changed stage', async () => {
    const onSessionEnd = vi.fn();
    const { user } = setup({ cards: [cat], onSessionEnd });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    await user.click(await screen.findByRole('button', { name: fr.flashcards.flip }));
    await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.good }));

    expect(await screen.findByRole('heading', { name: fr.flashcards.summaryTitle })).toBeVisible();
    expect(screen.getByText('0 mot(s) revu(s)')).toBeVisible();
    expect(screen.getByText('1 mot(s) nouveau(x)')).toBeVisible();
    const changes = screen.getByRole('list', { name: fr.flashcards.stageChangesTitle });
    expect(within(changes).getByRole('listitem')).toHaveTextContent('猫 : Graine → Pousse');
    expect(onSessionEnd).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: fr.flashcards.restart }));
    expect(screen.getByRole('button', { name: fr.flashcards.start })).toBeVisible();
  });

  it('says that nothing is thirsty when the queue is empty', async () => {
    const { user, onSessionEnd } = setup({ cards: [apple] });

    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    expect(await screen.findByText(fr.flashcards.nothingDue)).toBeVisible();
    expect(onSessionEnd).not.toHaveBeenCalled();
  });

  it('can be left at any time, the answers given being already stored', async () => {
    const { user, onSessionEnd } = setup({
      data: { reviewStates: [reviewed('cat'), reviewed('dog')] },
    });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    await user.click(await screen.findByRole('button', { name: fr.flashcards.flip }));
    await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.hard }));
    await screen.findByText('2 / 2');

    await user.click(screen.getByRole('button', { name: fr.flashcards.quit }));

    expect(await screen.findByText('Tes 1 réponse(s) sont enregistrées.')).toBeVisible();
    expect(onSessionEnd).toHaveBeenCalledOnce();
  });

  it('trains on English words from the English tab', async () => {
    const { user, startSession } = setup();

    await user.click(screen.getByRole('radio', { name: fr.languages.en }));
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    expect(startSession).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }));
    expect(await screen.findByText('1 / 1')).toBeVisible();
  });

  it('tells when an answer could not be stored, and keeps the card', async () => {
    const { user, store } = setup({ cards: [cat] });
    vi.spyOn(store, 'recordAnswer').mockRejectedValue(new Error('disk full'));
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    await user.click(await screen.findByRole('button', { name: fr.flashcards.flip }));

    await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.good }));

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.flashcards.saveFailed);
    expect(screen.getByText('1 / 1')).toBeVisible();
  });

  it('tells when the session could not start', async () => {
    const { user, startSession } = setup();
    startSession.mockRejectedValueOnce(new Error('blocked'));

    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.flashcards.startFailed);
  });
});
