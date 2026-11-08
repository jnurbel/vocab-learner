import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import fr from '../../i18n/fr.json';
import { FakeSpeaker } from '../dictation/dictation.fixtures';
import { reviewed, srs } from '../flashcards/flashcards.fixtures';
import FinalChallenge from './FinalChallenge.svelte';
import { startFinalChallenge } from './finalChallengeSession';
import { ChallengeStore, fruitWords, lessonLabel } from './path.fixtures';

type User = ReturnType<typeof userEvent.setup>;

function setup(voice = true) {
  const store = new ChallengeStore({ reviewStates: fruitWords.map(({ id }) => reviewed(id)) });
  const speaker = new FakeSpeaker(voice, true);
  const handlers = { onReview: vi.fn(), onBack: vi.fn(), onFinished: vi.fn() };
  render(FinalChallenge, {
    labelName: 'Unit 3',
    speaker,
    startChallenge: () =>
      startFinalChallenge(
        { label: lessonLabel, language: 'en', cards: fruitWords, audio: voice },
        {
          store,
          srs,
          clock: () => new Date('2026-11-07T08:00:00Z'),
          newId: () => 'challenge-1',
          loadPinyin: () => Promise.reject(new Error('English only')),
        },
      ),
    ...handlers,
  });
  return { store, speaker, ...handlers, user: userEvent.setup() };
}

/** The word asked: the one read aloud, or the meaning shown; never the order of the words. */
function askedWord(speaker: FakeSpeaker): Card {
  const meaning = screen.queryByTestId('challenge-meaning');
  const word = fruitWords.find(({ translation, term }) =>
    meaning === null ? term === speaker.last().text : translation === meaning.textContent,
  );
  if (word === undefined) {
    throw new Error('No word asked');
  }
  return word;
}

/** Answers the whole challenge, missing the words given. */
async function answerAll(user: User, speaker: FakeSpeaker, missed: readonly string[] = []) {
  for (let answered = 0; answered < fruitWords.length; answered += 1) {
    const word = askedWord(speaker);
    const right = !missed.includes(word.id);
    const options = screen.queryByRole('group', { name: fr.finalChallenge.optionsLabel });
    if (options !== null) {
      await user.click(
        right
          ? within(options).getByRole('button', { name: word.translation })
          : screen.getByRole('button', { name: fr.finalChallenge.dontKnow }),
      );
    } else {
      await user.type(
        screen.getByLabelText(fr.finalChallenge.answerLabel),
        right ? word.term : 'x',
      );
      await user.click(screen.getByRole('button', { name: fr.finalChallenge.validate }));
    }
    if (answered < fruitWords.length - 1) {
      await screen.findByText(`${String(answered + 2)}/10`);
    }
  }
}

async function begin(user: User) {
  await user.click(await screen.findByRole('button', { name: fr.finalChallenge.start }));
}

describe('FinalChallenge', () => {
  it('explains the conditions of a test before it starts', async () => {
    setup();

    expect(
      await screen.findByText(
        'Conditions de contrôle : 10 questions, pas d’indice, pas de correction avant la fin. Environ 2 min.',
      ),
    ).toBeVisible();
  });

  it('unlocks the voice in the click on Start and reads the first word', async () => {
    const { speaker, user } = setup();

    await begin(user);

    expect(speaker.unlock).toHaveBeenCalled();
    expect(fruitWords.map(({ term }) => term)).toContain(speaker.last().text);
    expect(screen.getByRole('heading', { name: 'Compréhension orale' })).toBeVisible();
    expect(screen.getByText('1/10')).toBeVisible();
  });

  it('reads a dictated word twice, slower first', async () => {
    const { speaker, user } = setup();
    await begin(user);
    for (let index = 0; index < 3; index += 1) {
      await user.click(screen.getByRole('button', { name: fr.finalChallenge.dontKnow }));
    }

    expect(await screen.findByRole('heading', { name: 'Dictée' })).toBeVisible();
    const [slow, normal] = speaker.readings.slice(-2);
    expect(slow?.text).toBe(normal?.text);
    expect([slow?.rate, normal?.rate]).toEqual([0.85, 1]);
  });

  it('shows no feedback during the challenge, then a passing score out of 20', async () => {
    const { speaker, onFinished, user } = setup();
    await begin(user);

    await answerAll(user, speaker, ['apple', 'pear']);

    expect(
      await screen.findByRole('heading', { name: fr.finalChallenge.resultPassed }),
    ).toBeVisible();
    expect(screen.getByText('Note : 16 sur 20')).toBeInTheDocument();
    expect(screen.getByText('Parcours terminé : Unit 3')).toBeVisible();
    expect(onFinished).toHaveBeenCalled();
  });

  it('lists the words missed, with their audio, and reviews them', async () => {
    const { speaker, onReview, user } = setup();
    await begin(user);
    await answerAll(user, speaker, ['apple', 'banana', 'cherry']);

    expect(
      await screen.findByRole('heading', { name: fr.finalChallenge.resultNotYet }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Écouter banana' }));
    expect(speaker.last().text).toBe('banana');
    await user.click(screen.getByRole('button', { name: 'Revoir ces 3 mots (≈ 2 min)' }));

    expect(onReview).toHaveBeenCalledWith(
      expect.arrayContaining(
        ['apple', 'banana', 'cherry'].map((id): unknown => expect.objectContaining({ id })),
      ),
    );
  });

  it('leaves without a score, back to the path', async () => {
    const { onBack, user } = setup();
    await begin(user);

    await user.click(screen.getByRole('button', { name: fr.finalChallenge.quit }));

    expect(onBack).toHaveBeenCalled();
  });

  it('shows the word written in place of a voice that is missing', async () => {
    const { user } = setup(false);
    await begin(user);

    expect(screen.getByText(fr.finalChallenge.noVoice)).toBeVisible();
    const written = screen.getByTestId('challenge-written').textContent.trim();
    expect(fruitWords.map(({ term }) => term)).toContain(written);
  });
});
