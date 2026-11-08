import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { Label } from '../../domain/label';
import type { PinyinGenerator } from '../../domain/pinyinGeneration';
import fr from '../../i18n/fr.json';
import { createWebSpeechSpeaker } from '../../services/tts/speaker';
import { fakeSpeech, voice } from '../../services/tts/speech.fixtures';
import type { StudyData } from '../../storage/studyRepository';
import { card, FakeSpeaker, FakeStore, srs } from './dictation.fixtures';
import Dictation from './Dictation.svelte';
import type { PlayerTimers } from './dictationPlayer';
import { startDictationSession, type DictationSelection } from './dictationSession';

const morning = new Date('2026-11-06T08:00:00Z');

const zai = card('zai', { term: '再', pinyin: 'zài', translation: 'encore', labelIds: ['l7'] });
const cat = card('cat', { term: '猫', pinyin: 'māo', translation: 'chat', labelIds: ['l7'] });
const dog = card('dog', { term: '狗', pinyin: 'gǒu', translation: 'chien' });
const necessary = card('necessary', {
  language: 'en',
  term: 'necessary',
  translation: 'nécessaire',
});
const lesson: Label = {
  id: 'l7',
  name: 'Leçon 7',
  isFocus: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const PINYIN: Readonly<Record<string, string>> = { 再: 'zài', 在: 'zài', 猫: 'māo', 狗: 'gǒu' };
const fakePinyin: PinyinGenerator = (hanzi) =>
  Array.from(hanzi, (char) => PINYIN[char] ?? char).join(' ');

function setup({
  cards = [zai, cat, dog, necessary],
  data = {},
  speaker = new FakeSpeaker(true, true),
  defaultMode,
  defaultSpeed,
  timers,
}: {
  cards?: Card[];
  data?: Partial<StudyData>;
  speaker?: FakeSpeaker;
  defaultMode?: 'keyboard' | 'paper';
  defaultSpeed?: 'slow' | 'normal' | 'fast';
  timers?: PlayerTimers;
} = {}) {
  const store = new FakeStore(data);
  const startSession = vi.fn((selection: DictationSelection) =>
    startDictationSession(selection, { store, srs, clock: () => morning, newId: () => 'd1' }),
  );
  const onSessionEnd = vi.fn();
  render(Dictation, {
    cards,
    labels: [lesson],
    speaker,
    startSession,
    loadPinyin: () => Promise.resolve(fakePinyin),
    onSessionEnd,
    newSeed: () => 'seed',
    ...(defaultMode === undefined ? {} : { defaultMode }),
    ...(defaultSpeed === undefined ? {} : { defaultSpeed }),
    ...(timers === undefined ? {} : { timers }),
  });
  return { store, startSession, speaker, onSessionEnd, user: userEvent.setup() };
}

function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`No item at ${String(index)}`);
  }
  return item;
}

const region = () => screen.getByRole('region', { name: fr.dictation.title });
const answerField = () => screen.getByRole('textbox', { name: fr.dictation.answerLabel });

async function startDictation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: fr.dictation.start }));
  return screen.findByRole('textbox', { name: fr.dictation.answerLabel });
}

describe('Dictation, start screen', () => {
  it('offers the language, labels, word count, reading options and answer mode', () => {
    setup();

    expect(screen.getByRole('radio', { name: fr.languages.zh })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Leçon 7' })).not.toBeChecked();
    expect(screen.getByRole('spinbutton', { name: fr.dictation.wordCount })).toHaveValue(10);
    expect(screen.getByRole('checkbox', { name: fr.dictation.shuffle })).not.toBeChecked();
    // Twice by default: a word heard once on a phone speaker is easily missed.
    expect(screen.getByRole('checkbox', { name: fr.dictation.readTwice })).toBeChecked();
    expect(screen.getByRole('combobox', { name: fr.dictation.delay })).toHaveValue('5');
    expect(screen.getByRole('radio', { name: fr.dictation.speeds.normal })).toBeChecked();
    expect(screen.getByRole('radio', { name: fr.dictation.modes.keyboard })).toBeChecked();
  });

  it('starts at the speed of the voice chosen in the settings', () => {
    setup({ defaultSpeed: 'slow' });

    expect(screen.getByRole('radio', { name: fr.dictation.speeds.slow })).toBeChecked();
  });

  it('reads at the new, slower rates: 0.5, 0.7 and 0.9', async () => {
    const { user, speaker } = setup();
    await user.click(screen.getByRole('radio', { name: fr.dictation.speeds.fast }));
    await startDictation(user);

    expect(speaker.last()).toMatchObject({ text: '再', rate: 0.9 });
  });

  it('can default to answering on paper, e.g. on a phone', () => {
    setup({ defaultMode: 'paper' });

    expect(screen.getByRole('radio', { name: fr.dictation.modes.paper })).toBeChecked();
  });

  it('dictates the words of the chosen labels', async () => {
    const { user, startSession } = setup();

    await user.click(screen.getByRole('checkbox', { name: 'Leçon 7' }));
    await startDictation(user);

    expect(startSession).toHaveBeenCalledWith({
      language: 'zh',
      labelIds: ['l7'],
      words: [zai, cat],
    });
  });

  it('says so when no word matches the choice', async () => {
    const { user, startSession } = setup({ cards: [necessary] });

    await user.click(screen.getByRole('button', { name: fr.dictation.start }));

    expect(screen.getByRole('alert')).toHaveTextContent(fr.dictation.noWords);
    expect(startSession).not.toHaveBeenCalled();
  });
});

describe('Dictation, answering with the keyboard', () => {
  it('reads the word, focuses the answer field, and accepts the right hanzi', async () => {
    const { user, speaker, store } = setup();
    const field = await startDictation(user);

    expect(field).toHaveFocus();
    expect(field).toHaveAttribute('lang', 'zh-CN');
    expect(within(region()).getByRole('status')).toHaveTextContent('Mot 1 sur 3');
    expect(speaker.last()).toMatchObject({ text: '再', language: 'zh', rate: 0.7 });
    expect(within(region()).queryByText('再')).toBeNull();

    await user.type(field, '再{Enter}');

    expect(await screen.findByText(fr.dictation.correct)).toBeVisible();
    expect(store.answers[0]?.result).toMatchObject({
      cardId: 'zai',
      outcome: 'correct',
      rating: 'good',
      exercise: 'listenType',
      answer: '再',
    });
    await user.click(screen.getByRole('button', { name: fr.dictation.continue }));
    expect(within(region()).getByRole('status')).toHaveTextContent('Mot 2 sur 3');
    expect(answerField()).toHaveValue('');
    expect(answerField()).toHaveFocus();
    expect(speaker.last().text).toBe('猫');
  });
});

describe('Dictation, input method (IME)', () => {
  it('never validates on the Enter that confirms a composition', async () => {
    const { user, store } = setup();
    const field = await startDictation(user);

    await fireEvent.compositionStart(field);
    await fireEvent.input(field, { target: { value: '再' } });
    await fireEvent.keyDown(field, { key: 'Enter' });
    await fireEvent.compositionEnd(field);
    await fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    await fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 });
    expect(screen.queryByText(fr.dictation.correct)).toBeNull();
    expect(store.answers).toHaveLength(0);

    await fireEvent.keyDown(field, { key: 'Enter' });
    expect(await screen.findByText(fr.dictation.correct)).toBeVisible();
  });

  it('does not validate a blank answer', async () => {
    const { user, store } = setup();
    const field = await startDictation(user);

    await user.type(field, '   {Enter}');

    expect(store.answers).toHaveLength(0);
    expect(field).toHaveFocus();
  });
});

describe('Dictation, feedback', () => {
  it('explains a same-sounding character, shows the diff, and stores a wrong answer', async () => {
    const { user, store, speaker } = setup();
    const field = await startDictation(user);

    await user.type(field, '在{Enter}');

    expect(await screen.findByText('Faux. La réponse était 再.')).toBeVisible();
    expect(screen.getByText('Bon son, mauvais caractère : 在 au lieu de 再.')).toBeVisible();
    expect(screen.getByRole('listitem', { name: '在, faux, attendu 再' })).toBeVisible();
    expect(within(region()).getByText('zài')).toBeVisible();
    expect(within(region()).getByText('encore')).toBeVisible();
    expect(store.answers[0]?.result).toMatchObject({ outcome: 'wrong', rating: 'again' });
    // Read twice, then once more after a mistake.
    expect(speaker.texts).toEqual(['再', '再', '再']);
    expect(screen.getByRole('button', { name: fr.dictation.continue })).toHaveFocus();
  });

  it('says almost for one typo in a long English word', async () => {
    const { user, store } = setup({ cards: [necessary] });
    await user.click(screen.getByRole('radio', { name: fr.languages.en }));
    const field = await startDictation(user);
    expect(field).toHaveAttribute('lang', 'en');

    await user.type(field, 'neccessary{Enter}');

    expect(await screen.findByText('Presque : necessary.')).toBeVisible();
    expect(store.answers[0]?.result).toMatchObject({ outcome: 'almost', rating: 'hard' });
  });

  it('records "I do not know" as wrong and shows the answer', async () => {
    const { user, store } = setup();
    await startDictation(user);

    await user.click(screen.getByRole('button', { name: fr.dictation.dontKnow }));

    expect(await screen.findByText('Faux. La réponse était 再.')).toBeVisible();
    expect(store.answers[0]?.result).toMatchObject({ outcome: 'wrong', rating: 'again' });
    expect(store.answers[0]?.result.answer).toBeUndefined();
  });

  it('shows the pinyin as a hint, which turns a right answer into a right answer with hint', async () => {
    const { user, store } = setup();
    const field = await startDictation(user);

    await user.click(screen.getByRole('button', { name: fr.dictation.hint }));
    expect(within(region()).getByText('zài')).toBeVisible();
    expect(screen.getByText(fr.dictation.hintUsed)).toBeVisible();
    await user.type(field, '再{Enter}');

    expect(await screen.findByText(fr.dictation.correct)).toBeVisible();
    expect(store.answers[0]?.result).toMatchObject({
      outcome: 'correctWithHint',
      rating: 'hard',
      hintsUsed: 1,
    });
  });

  it('gives the first letter and the length as a hint in English', async () => {
    const { user } = setup({ cards: [necessary] });
    await user.click(screen.getByRole('radio', { name: fr.languages.en }));
    await startDictation(user);

    await user.click(screen.getByRole('button', { name: fr.dictation.hint }));

    expect(screen.getByText('Commence par « n », 9 lettres.')).toBeVisible();
  });
});

describe('Dictation, listening again', () => {
  it('replays the word with the button, the up arrow, and slowly with the down arrow', async () => {
    const { user, speaker } = setup();
    const field = await startDictation(user);

    // Read twice at start, then once per replay.
    await user.click(screen.getByRole('button', { name: fr.dictation.replay }));
    expect(speaker.readings).toHaveLength(3);
    field.focus();
    await user.keyboard('{ArrowUp}');
    expect(speaker.readings).toHaveLength(4);
    await user.keyboard('{ArrowDown}');
    // Half the normal 0.7, raised to the minimum of 0.4.
    expect(speaker.last()).toMatchObject({ text: '再', rate: 0.4 });

    // The arrows belong to the input method while it composes.
    await fireEvent.compositionStart(field);
    await fireEvent.keyDown(field, { key: 'ArrowUp' });
    expect(speaker.readings).toHaveLength(5);
  });

  it('replays with R outside the answer field only', async () => {
    const { user, speaker } = setup();
    const field = await startDictation(user);

    await user.type(field, 'r');
    expect(speaker.readings).toHaveLength(2);
    await user.click(screen.getByRole('heading', { name: fr.dictation.title }));
    await user.keyboard('r');
    expect(speaker.readings).toHaveLength(3);
  });
});

describe('Dictation without a voice', () => {
  it('shows the pinyin in Chinese as the instruction, and the word is typed', async () => {
    const { user, store } = setup({ speaker: new FakeSpeaker(false) });
    const field = await startDictation(user);

    expect(screen.getByText(fr.dictation.writtenPrompt.zh)).toBeVisible();
    expect(within(region()).getByText('zài')).toBeVisible();
    expect(screen.queryByRole('button', { name: fr.dictation.replay })).toBeNull();
    await user.type(field, '再{Enter}');

    expect(store.answers[0]?.result.outcome).toBe('correct');
  });

  it('shows the meaning in English as the instruction', async () => {
    const { user } = setup({ cards: [necessary], speaker: new FakeSpeaker(false) });
    await user.click(screen.getByRole('radio', { name: fr.languages.en }));
    await startDictation(user);

    expect(screen.getByText(fr.dictation.writtenPrompt.en)).toBeVisible();
    expect(within(region()).getByText('nécessaire')).toBeVisible();
  });

  it('falls back to the written instruction when a reading fails', async () => {
    const speaker = new FakeSpeaker(true, true);
    vi.spyOn(speaker, 'speak').mockRejectedValue(new Error('Speech failed'));
    const { user } = setup({ speaker });
    await startDictation(user);

    expect(await screen.findByText(fr.dictation.audioError)).toBeVisible();
    expect(within(region()).getByText('zài')).toBeVisible();
  });
});

describe('Dictation on a phone, where speech needs a user gesture', () => {
  /** The real speaker over a fake phone synthesis that drops speech outside a gesture. */
  function setupOnPhone() {
    const speech = fakeSpeech({ lateVoices: [voice('zh-CN')], requireGesture: true });
    const speaker = createWebSpeechSpeaker(speech.host, { leadInMs: 0 });
    const store = new FakeStore();
    render(Dictation, {
      cards: [zai, cat, dog],
      labels: [],
      speaker,
      startSession: (selection: DictationSelection) =>
        startDictationSession(selection, { store, srs, clock: () => morning, newId: () => 'd1' }),
      loadPinyin: () => Promise.resolve(fakePinyin),
      onSessionEnd: vi.fn(),
      newSeed: () => 'seed',
    });
    return speech;
  }

  it('reads the first word aloud after the click on Start, despite the awaits before it', async () => {
    const speech = setupOnPhone();
    const start = screen.getByRole('button', { name: fr.dictation.start });

    speech.gesture(() => {
      start.click();
    });
    speech.deliverLateVoices();

    await vi.waitFor(() => {
      expect(speech.heard).toEqual(['再']);
    });
    expect(speech.dropped).toEqual([]);
  });

  it('unlocks the speech in the click itself, before anything is awaited', () => {
    const { speaker } = setup();

    screen.getByRole('button', { name: fr.dictation.start }).click();

    expect(speaker.unlock).toHaveBeenCalledTimes(1);
  });

  it('unlocks the speech again in the click on Replay', async () => {
    const { user, speaker } = setup();
    await startDictation(user);
    speaker.unlock.mockClear();

    screen.getByRole('button', { name: fr.dictation.replay }).click();

    expect(speaker.unlock).toHaveBeenCalledTimes(1);
  });

  it('offers to turn the sound on when the browser refused to speak, then reads the word', async () => {
    const { user, speaker } = setup({ speaker: new FakeSpeaker() });
    await startDictation(user);

    speaker.last().block();

    expect(await screen.findByText(fr.voice.blocked)).toBeVisible();
    expect(within(region()).getByText('zài')).toBeVisible();
    speaker.unlock.mockClear();
    await user.click(screen.getByRole('button', { name: fr.voice.enable }));

    expect(speaker.unlock).toHaveBeenCalledTimes(1);
    expect(speaker.texts).toEqual(['再', '再']);
    expect(screen.queryByText(fr.voice.blocked)).toBeNull();
    expect(answerField()).toHaveFocus();
  });

  it('explains how to install the Chinese voice when the phone has none', async () => {
    const { user } = setup({ speaker: new FakeSpeaker(false) });
    await startDictation(user);

    expect(screen.getByText(fr.voice.missingHelpTitle)).toBeVisible();
    expect(screen.getByText(fr.voice.missingHelpAndroid)).toBeInTheDocument();
  });
});

describe('Dictation, end', () => {
  async function answerAll(user: ReturnType<typeof userEvent.setup>, answers: string[]) {
    for (const answer of answers) {
      await user.type(answerField(), `${answer}{Enter}`);
      await user.click(await screen.findByRole('button', { name: fr.dictation.continue }));
    }
  }

  it('shows the points the dictation brought, with the daily goal', async () => {
    const { user } = setup();
    await startDictation(user);

    await answerAll(user, ['再', '描', '狗']);

    expect(await screen.findByRole('heading', { name: fr.dictation.summaryTitle })).toBeVisible();
    expect(await screen.findByText(/^[+][0-9]+ XP$/)).toBeVisible();
    expect(screen.getByText(/^Objectif du jour : [0-9]+ [/] 300 XP$/)).toBeVisible();
  });

  it('shows the score and the mistakes with their audio, then retries the missed words', async () => {
    const { user, speaker, onSessionEnd, startSession, store } = setup();
    await startDictation(user);

    await answerAll(user, ['再', '描', '狗']);

    expect(await screen.findByRole('heading', { name: fr.dictation.summaryTitle })).toBeVisible();
    expect(screen.getByText('Score : 2 / 3')).toBeVisible();
    const mistakes = screen.getByRole('list', { name: fr.dictation.mistakesTitle });
    expect(within(mistakes).getAllByRole('listitem')).toHaveLength(1);
    expect(within(mistakes).getByText('猫')).toBeVisible();
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    expect(store.sessions[0]?.endedAt).toBeDefined();

    await user.click(within(mistakes).getByRole('button', { name: fr.dictation.listen }));
    expect(speaker.last().text).toBe('猫');

    await user.click(screen.getByRole('button', { name: fr.dictation.retryMissed }));
    expect(await screen.findByRole('textbox', { name: fr.dictation.answerLabel })).toBeVisible();
    expect(startSession).toHaveBeenLastCalledWith(expect.objectContaining({ words: [cat] }));
    expect(within(region()).getByRole('status')).toHaveTextContent('Mot 1 sur 1');
  });

  it('can stop early: the answers given are kept', async () => {
    const { user, onSessionEnd } = setup();
    await startDictation(user);
    await answerAll(user, ['再']);

    await user.click(screen.getByRole('button', { name: fr.dictation.quit }));

    expect(await screen.findByText('Score : 1 / 1')).toBeVisible();
    expect(screen.getByText(fr.dictation.noMistakes)).toBeVisible();
    expect(screen.queryByRole('button', { name: fr.dictation.retryMissed })).toBeNull();
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: fr.dictation.restart }));
    expect(screen.getByRole('button', { name: fr.dictation.start })).toBeVisible();
  });

  it('reports an answer that could not be saved', async () => {
    const { user, store } = setup();
    vi.spyOn(store, 'recordAnswer').mockRejectedValue(new Error('Quota exceeded'));
    const field = await startDictation(user);

    await user.type(field, '再{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.dictation.saveFailed);
    expect(screen.queryByText(fr.dictation.correct)).toBeNull();
  });
});

/** Timers that fire only when the test says so. */
class ManualTimers implements PlayerTimers {
  private readonly pending = new Map<number, () => void>();
  private lastId = 0;

  readonly setTimeout = (callback: () => void) => {
    this.lastId += 1;
    this.pending.set(this.lastId, callback);
    return this.lastId;
  };

  readonly clearTimeout = (handle: unknown) => {
    this.pending.delete(handle as number);
  };

  /** Fires the timers due, one second of countdown each. */
  async elapse(seconds: number) {
    for (let second = 0; second < seconds; second++) {
      const [entry] = this.pending;
      if (entry !== undefined) {
        this.pending.delete(entry[0]);
        entry[1]();
      }
      await tick();
    }
  }
}

describe('Dictation on paper', () => {
  async function startOnPaper(
    user: ReturnType<typeof userEvent.setup>,
    { delay = '5' }: { delay?: string } = {},
  ) {
    await user.click(screen.getByRole('radio', { name: fr.dictation.modes.paper }));
    await user.selectOptions(screen.getByRole('combobox', { name: fr.dictation.delay }), delay);
    await user.click(screen.getByRole('button', { name: fr.dictation.start }));
    await screen.findByRole('status');
  }

  it('reads the words one after the other with a countdown, then asks for a self-correction', async () => {
    const timers = new ManualTimers();
    const { user, speaker, store, onSessionEnd } = setup({ timers });
    await startOnPaper(user);

    expect(within(region()).getByRole('status')).toHaveTextContent('Mot 1 sur 3');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(await screen.findByText('Mot suivant dans 5 s')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: fr.dictation.countdownLabel })).toBeVisible();
    await timers.elapse(1);
    expect(screen.getByText('Mot suivant dans 4 s')).toBeVisible();
    await timers.elapse(4);
    expect(within(region()).getByRole('status')).toHaveTextContent('Mot 2 sur 3');
    await timers.elapse(10);

    expect(
      await screen.findByRole('heading', { name: fr.dictation.correctionTitle }),
    ).toBeVisible();
    expect(speaker.texts).toEqual(['再', '再', '猫', '猫', '狗', '狗']);
    expect(within(region()).getByText('再')).toHaveAttribute('lang', 'zh-CN');
    expect(within(region()).getByText('zài')).toBeVisible();
    expect(within(region()).getByText('encore')).toBeVisible();

    const submit = screen.getByRole('button', { name: fr.dictation.submitCorrection });
    expect(submit).toBeDisabled();
    const marks = screen.getAllByRole('group', { name: /ton résultat/ });
    expect(marks).toHaveLength(3);
    await user.click(within(nth(marks, 0)).getByRole('radio', { name: 'Juste' }));
    await user.click(within(nth(marks, 1)).getByRole('radio', { name: 'À moitié' }));
    await user.click(within(nth(marks, 2)).getByRole('radio', { name: 'Faux' }));
    await user.click(submit);

    expect(await screen.findByText('Score : 1 / 3')).toBeVisible();
    expect(
      store.answers.map(({ result }) => [result.cardId, result.outcome, result.rating]),
    ).toEqual([
      ['zai', 'correct', 'good'],
      ['cat', 'almost', 'hard'],
      ['dog', 'wrong', 'again'],
    ]);
    expect(store.sessions[0]).toMatchObject({ mode: 'dictation' });
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
  });

  it('pauses with the space bar, moves with the arrows and replays with R', async () => {
    const { user, speaker } = setup();
    await startOnPaper(user, { delay: 'manual' });
    expect(await screen.findByText(fr.dictation.writeNow)).toBeVisible();

    await user.keyboard(' ');
    expect(screen.getByText(fr.dictation.paused)).toBeVisible();
    expect(screen.getByRole('button', { name: fr.dictation.resume })).toBeVisible();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: fr.dictation.pause })).toBeVisible();

    await user.keyboard('{ArrowRight}');
    expect(within(region()).getByRole('status')).toHaveTextContent('Mot 2 sur 3');
    await user.keyboard('{ArrowLeft}');
    expect(within(region()).getByRole('status')).toHaveTextContent('Mot 1 sur 3');
    await user.keyboard('r');
    await user.keyboard('{ArrowDown}');
    expect(speaker.last()).toMatchObject({ text: '再', rate: 0.4 });
  });

  it('has buttons for every reading control', async () => {
    const { user } = setup();
    await startOnPaper(user, { delay: 'manual' });

    await user.click(screen.getByRole('button', { name: fr.dictation.next }));
    expect(within(region()).getByRole('status')).toHaveTextContent('Mot 2 sur 3');
    await user.click(screen.getByRole('button', { name: fr.dictation.previous }));
    expect(within(region()).getByRole('status')).toHaveTextContent('Mot 1 sur 3');
    await user.click(screen.getByRole('button', { name: fr.dictation.pause }));
    await user.click(screen.getByRole('button', { name: fr.dictation.resume }));
    await user.click(screen.getByRole('button', { name: fr.dictation.finishPaper }));

    expect(screen.getByRole('heading', { name: fr.dictation.correctionTitle })).toBeVisible();
    expect(screen.getAllByRole('group', { name: /ton résultat/ })).toHaveLength(3);
  });

  it('writes the instruction for each word when there is no voice', async () => {
    const { user } = setup({ speaker: new FakeSpeaker(false) });
    await startOnPaper(user, { delay: 'manual' });

    expect(screen.getByText(fr.dictation.writtenPrompt.zh)).toBeVisible();
    expect(within(region()).getByText('zài')).toBeVisible();
  });
});

describe('a dictation asked for by a step session of the path', () => {
  it('starts at once on the words of the step', async () => {
    const store = new FakeStore();
    const startSession = vi.fn((selection: DictationSelection) =>
      startDictationSession(selection, { store, srs, clock: () => morning, newId: () => 'd1' }),
    );
    render(Dictation, {
      cards: [zai, cat, dog, necessary],
      labels: [lesson],
      speaker: new FakeSpeaker(true, true),
      startSession,
      loadPinyin: () => Promise.resolve(fakePinyin),
      onSessionEnd: vi.fn(),
      newSeed: () => 'seed',
      startWith: { language: 'zh', words: [dog, cat] },
    });

    await vi.waitFor(() => {
      expect(startSession).toHaveBeenCalledWith({
        language: 'zh',
        labelIds: [],
        words: [dog, cat],
      });
    });
  });
});
