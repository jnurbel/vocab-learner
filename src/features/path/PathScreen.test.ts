import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card, Language } from '../../domain/card';
import { PATH_CONFIG } from '../../domain/path/pathConfig';
import { pathStatus } from '../../domain/path/pathStatus';
import type { PathProgressRecord, PathStep } from '../../domain/progressRecords';
import fr from '../../i18n/fr.json';
import { FakeSpeaker } from '../dictation/dictation.fixtures';
import PathScreen from './PathScreen.svelte';
import type { LoadedPath, PlacementOutcome } from './pathSession';

function card(id: string, example?: string): Card {
  return {
    id,
    language: 'zh',
    term: `词${id}`,
    translation: `mot ${id}`,
    ...(example === undefined ? {} : { example }),
    labelIds: ['lesson'],
    source: 'manual',
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  };
}

const words = ['a', 'b', 'c'].map((id) => card(id));
const label = {
  id: 'lesson',
  name: 'Leçon 7',
  isFocus: true,
  createdAt: '2026-11-01T08:00:00.000Z',
  updatedAt: '2026-11-01T08:00:00.000Z',
};

function loaded(
  steps: PathProgressRecord['steps'] = {},
  extra: Partial<PathProgressRecord> = {},
  cards: Card[] = words,
  language: Language = 'zh',
): LoadedPath {
  const progress: PathProgressRecord = { labelId: 'lesson', language, steps, ...extra };
  const input = { cards, states: [], progress };
  return {
    label,
    language,
    view: pathStatus(input, PATH_CONFIG),
    words: cards,
    stepWords: (step) => [`${step}-word`],
    placementWords: (step) => [`${step}-test`],
    input,
  };
}

const validated = (...names: PathStep[]) =>
  Object.fromEntries(names.map((name) => [name, 'validated' as const]));
const upToType = validated('discover', 'listen', 'recognize');

function setup(path: LoadedPath, props: Record<string, unknown> = {}) {
  const speaker = new FakeSpeaker();
  const handlers = {
    loadPath: vi.fn((language: Language) =>
      Promise.resolve(language === path.language ? path : loaded({}, {}, words, language)),
    ),
    onStartStep: vi.fn(() => {
      // The phone must be unlocked in the click, before the screen of the step opens.
      expect(speaker.unlock).toHaveBeenCalled();
    }),
    onLaunchExercise: vi.fn(),
    onFinalChallenge: vi.fn(),
    onAddExamples: vi.fn(),
  };
  render(PathScreen, {
    labelName: 'Leçon 7',
    languages: ['zh'],
    language: path.language,
    speaker,
    ...handlers,
    ...props,
  });
  return { ...handlers, speaker, user: userEvent.setup() };
}

const stepList = () => screen.findByRole('list', { name: fr.path.stepsLabel });

describe('PathScreen', () => {
  it('draws the seven steps with their state and the words already right', async () => {
    setup(loaded(validated('discover')));

    const items = within(await stepList()).getAllByRole('listitem');
    expect(items).toHaveLength(7);
    expect(items[0]).toHaveTextContent('1. Découvrir');
    expect(items[0]).toHaveTextContent('Validée');
    expect(items[1]).toHaveTextContent('2. Écouter');
    expect(items[1]).toHaveTextContent('À faire');
    expect(items[1]).toHaveTextContent('0/3 mots');
    expect(items[2]).toHaveTextContent('Verrouillée');
    expect(items[6]).toHaveTextContent('Pas encore tenté');
    expect(screen.getByText('1 / 7 étapes')).toBeInTheDocument();
  });

  it('continues the current step on the words still to get right, unlocking the voice first', async () => {
    const { onStartStep, user } = setup(loaded(validated('discover')));

    await user.click(await screen.findByRole('button', { name: fr.path.continue }));

    expect(onStartStep).toHaveBeenCalledWith('listen', ['listen-word'], 'stepSession');
  });

  it('starts a placement test on words drawn for it', async () => {
    const { onStartStep, user } = setup(loaded(validated('discover')));

    await user.click(await screen.findByRole('button', { name: fr.path.placement }));

    expect(onStartStep).toHaveBeenCalledWith('listen', ['listen-test'], 'placementTest');
  });

  it('offers no placement test for the first step, where "Je le connais déjà" does it', async () => {
    setup(loaded());

    await screen.findByRole('button', { name: fr.path.continue });
    expect(screen.queryByRole('button', { name: fr.path.placement })).not.toBeInTheDocument();
  });

  it('hands the recognize and sentences steps over to onLaunchExercise', async () => {
    const { onLaunchExercise, onStartStep, speaker, user } = setup(
      loaded(validated('discover', 'listen')),
    );

    await user.click(await screen.findByRole('button', { name: fr.path.continue }));
    await user.click(screen.getByRole('button', { name: fr.path.placement }));

    expect(onLaunchExercise).toHaveBeenNthCalledWith(
      1,
      'recognize',
      ['recognize-word'],
      'stepSession',
    );
    expect(onLaunchExercise).toHaveBeenNthCalledWith(
      2,
      'recognize',
      ['recognize-test'],
      'placementTest',
    );
    expect(onStartStep).not.toHaveBeenCalled();
    expect(speaker.unlock).toHaveBeenCalledTimes(2);
  });

  it('greys the sentences step without examples, with a way to add some', async () => {
    const { onAddExamples, user } = setup(loaded(upToType));

    const sentences = within(await stepList()).getAllByRole('listitem')[5];
    expect(sentences).toHaveTextContent('Sautée');
    expect(sentences).toHaveTextContent(fr.path.sentencesSkipped);
    await user.click(screen.getByRole('button', { name: fr.path.addExamples }));

    expect(onAddExamples).toHaveBeenCalled();
  });

  it('opens the final challenge once it is the current step', async () => {
    const { onFinalChallenge, speaker, user } = setup(
      loaded(validated('discover', 'listen', 'recognize', 'type', 'dictation')),
    );

    await user.click(await screen.findByRole('button', { name: fr.path.finalChallenge }));

    expect(speaker.unlock).toHaveBeenCalled();
    expect(onFinalChallenge).toHaveBeenCalled();
  });

  it('celebrates a step validated since the last visit and shows the next one', async () => {
    setup(loaded(validated('discover', 'listen')), { validatedBefore: ['discover'] });

    await stepList();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Étape validée : Écouter. +50 XP.');
    expect(status).toHaveTextContent('Prochaine étape : Reconnaître.');
  });

  it('celebrates nothing when no step was validated since the last visit', async () => {
    setup(loaded(validated('discover')), { validatedBefore: ['discover'] });

    await stepList();
    expect(screen.queryByText(/Étape validée/)).not.toBeInTheDocument();
  });

  it.each<[PlacementOutcome, string]>([
    [
      { step: 'listen', correct: 9, total: 10, passed: true, validated: true },
      '9/10 : étape validée.',
    ],
    [
      { step: 'listen', correct: 7, total: 10, passed: false, validated: false },
      '7/10 : pas encore. Tes réponses comptent quand même.',
    ],
  ])('tells the result of a placement test', async (placement, text) => {
    setup(loaded(validated('discover')), { placement });

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('shows the best score of the final challenge and the end of the path', async () => {
    setup(
      loaded(validated('discover', 'listen', 'recognize', 'type', 'dictation'), {
        finalChallengeBest: 17.5,
      }),
    );

    const items = within(await stepList()).getAllByRole('listitem');
    expect(items[6]).toHaveTextContent('Meilleure note : 17,5/20');
    expect(screen.getByText(fr.path.completed)).toBeInTheDocument();
  });

  it('switches to the path of the other language of the label', async () => {
    const { loadPath, user } = setup(loaded(), { languages: ['zh', 'en'] });

    await user.click(await screen.findByRole('tab', { name: 'Anglais' }));

    expect(loadPath).toHaveBeenLastCalledWith('en');
  });

  it('says when the path cannot be read', async () => {
    setup(loaded(), { loadPath: vi.fn(() => Promise.reject(new Error('broken'))) });

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.path.loadFailed);
  });
});
