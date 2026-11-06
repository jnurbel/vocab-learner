import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSpeaker } from './dictation.fixtures';
import { DictationPlayer, type PlayerSettings } from './dictationPlayer';

const WORDS = [
  { text: '猫', language: 'zh' as const },
  { text: '狗', language: 'zh' as const },
  { text: '鱼', language: 'zh' as const },
];

/** Lets the pending promises run, e.g. after a reading ended. */
const settle = () => vi.advanceTimersByTimeAsync(0);

function setup(settings: Partial<PlayerSettings> = {}) {
  const speaker = new FakeSpeaker();
  const player = new DictationPlayer(
    WORDS,
    { readingsPerWord: 1, delayMs: 3_000, rate: 0.85, ...settings },
    { speaker },
  );
  return { speaker, player };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DictationPlayer', () => {
  it('waits for play before reading anything', () => {
    const { speaker, player } = setup();

    expect(player.snapshot).toMatchObject({ status: 'idle', index: 0, total: 3 });
    expect(speaker.readings).toHaveLength(0);
  });

  it('reads a word at the chosen rate, counts down once it is read, then reads the next', async () => {
    const { speaker, player } = setup();

    player.play();
    expect(player.snapshot.status).toBe('speaking');
    expect(speaker.last()).toMatchObject({ text: '猫', language: 'zh', rate: 0.85 });

    // The countdown starts at the end of the utterance, not after a guessed duration.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(speaker.readings).toHaveLength(1);
    speaker.last().end();
    await settle();
    expect(player.snapshot).toMatchObject({ status: 'waiting', index: 0, remainingMs: 3_000 });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(player.snapshot.remainingMs).toBe(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(player.snapshot).toMatchObject({ status: 'speaking', index: 1 });
    expect(speaker.texts).toEqual(['猫', '狗']);
  });

  it('finishes after the pause that follows the last word', async () => {
    const { speaker, player } = setup();
    player.play();
    for (const word of WORDS) {
      expect(speaker.last().text).toBe(word.text);
      speaker.last().end();
      await settle();
      await vi.advanceTimersByTimeAsync(3_000);
    }

    expect(player.snapshot.status).toBe('finished');
    expect(speaker.texts).toEqual(['猫', '狗', '鱼']);
  });

  it('reads each word twice on request, the second time right after the first', async () => {
    const { speaker, player } = setup({ readingsPerWord: 2 });

    player.play();
    speaker.last().end();
    await settle();

    expect(player.snapshot.status).toBe('speaking');
    expect(speaker.texts).toEqual(['猫', '猫']);
    speaker.last().end();
    await settle();
    expect(player.snapshot.status).toBe('waiting');
  });

  it('waits for the learner in manual mode, then moves on with next', async () => {
    const { speaker, player } = setup({ delayMs: undefined });
    player.play();
    speaker.last().end();
    await settle();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(player.snapshot).toMatchObject({ status: 'waiting', index: 0 });
    expect(player.snapshot.remainingMs).toBeUndefined();

    player.next();
    expect(player.snapshot).toMatchObject({ status: 'speaking', index: 1 });
    player.next();
    player.next();
    expect(player.snapshot.status).toBe('finished');
  });

  it('tells its listeners about every change, until they unsubscribe', async () => {
    const { speaker, player } = setup();
    const listener = vi.fn();
    const unsubscribe = player.subscribe(listener);

    player.play();
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'speaking' }));
    unsubscribe();
    speaker.last().end();
    await settle();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('pauses a reading and reads the word again from its start on resume', async () => {
    const { speaker, player } = setup();
    player.play();

    player.pause();
    expect(player.snapshot.status).toBe('paused');
    expect(speaker.cancel).toHaveBeenCalled();
    await settle();
    expect(player.snapshot.status).toBe('paused');

    player.resume();
    expect(player.snapshot).toMatchObject({ status: 'speaking', index: 0 });
    expect(speaker.texts).toEqual(['猫', '猫']);
  });

  it('pauses the countdown and resumes it where it stopped', async () => {
    const { speaker, player } = setup({ delayMs: 5_000 });
    player.play();
    speaker.last().end();
    await settle();
    await vi.advanceTimersByTimeAsync(2_000);

    player.pause();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(player.snapshot).toMatchObject({ status: 'paused', remainingMs: 3_000 });

    player.resume();
    expect(player.snapshot.status).toBe('waiting');
    await vi.advanceTimersByTimeAsync(3_000);
    expect(player.snapshot).toMatchObject({ status: 'speaking', index: 1 });
  });

  it('toggles between pause and resume, e.g. with the space bar', async () => {
    const { speaker, player } = setup();
    player.play();
    speaker.last().end();
    await settle();

    player.togglePause();
    expect(player.snapshot.status).toBe('paused');
    player.togglePause();
    expect(player.snapshot.status).toBe('waiting');
  });

  it('repeats the current word, slowly on request, then counts down again', async () => {
    const { speaker, player } = setup();
    player.play();
    speaker.last().end();
    await settle();
    await vi.advanceTimersByTimeAsync(2_000);

    player.repeat({ slow: true });
    expect(player.snapshot).toMatchObject({ status: 'speaking', index: 0 });
    expect(speaker.last()).toMatchObject({ text: '猫', rate: 0.6 });
    speaker.last().end();
    await settle();
    expect(player.snapshot).toMatchObject({ status: 'waiting', remainingMs: 3_000 });

    player.repeat();
    expect(speaker.last()).toMatchObject({ text: '猫', rate: 0.85 });
  });

  it('repeats a word only once even when each word is read twice', async () => {
    const { speaker, player } = setup({ readingsPerWord: 2 });
    player.play();
    speaker.last().end();
    await settle();
    speaker.last().end();
    await settle();

    player.repeat();
    speaker.last().end();
    await settle();

    expect(speaker.texts).toEqual(['猫', '猫', '猫']);
    expect(player.snapshot.status).toBe('waiting');
  });

  it('goes back to the previous word, never before the first', () => {
    const { speaker, player } = setup();
    player.play();
    player.next();

    player.previous();
    expect(player.snapshot).toMatchObject({ status: 'speaking', index: 0 });
    player.previous();
    expect(player.snapshot.index).toBe(0);
    expect(speaker.texts).toEqual(['猫', '狗', '猫', '猫']);
  });

  it('stops for good: nothing more is read', async () => {
    const { speaker, player } = setup();
    player.play();

    player.stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(player.snapshot.status).toBe('finished');
    expect(speaker.readings).toHaveLength(1);
    player.play();
    player.next();
    player.previous();
    player.repeat();
    player.resume();
    expect(speaker.readings).toHaveLength(1);
  });

  it('ignores actions that make no sense in the current state', () => {
    const { speaker, player } = setup();

    player.pause();
    player.resume();
    player.repeat();
    expect(player.snapshot.status).toBe('idle');
    player.play();
    player.play();
    expect(speaker.readings).toHaveLength(1);
  });
});
