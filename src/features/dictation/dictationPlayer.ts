import type { Language } from '../../domain/card';
import { DICTATION_RATES, type DictationPlan } from '../../domain/dictation/dictationPlan';
import type { Speaker } from '../../services/tts/speaker';

export interface DictationWord {
  text: string;
  language: Language;
}

export type PlayerSettings = Pick<DictationPlan, 'readingsPerWord' | 'delayMs' | 'rate'>;

export type PlayerStatus = 'idle' | 'speaking' | 'waiting' | 'paused' | 'finished';

export interface PlayerSnapshot {
  status: PlayerStatus;
  /** The word being read or waited for, from 0. */
  index: number;
  total: number;
  /** Countdown before the next word; undefined when the learner moves on (manual mode). */
  remainingMs: number | undefined;
  /** A reading failed: the screen falls back to the written variant (GAME_DESIGN.md 6.2). */
  audioFailed: boolean;
}

export interface PlayerTimers {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface PlayerDependencies {
  speaker: Speaker;
  /** The browser's timers by default; injected so that tests control the clock. */
  timers?: PlayerTimers;
}

/** The countdown is updated every second, for the ring and for screen readers. */
const TICK_MS = 1_000;

const browserTimers: PlayerTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  },
};

/**
 * Reads the words of a dictation one after the other (DESIGN.md 6). A word is followed by its
 * second reading or by the countdown only once the utterance has ended: iOS does not let a
 * timer start speech, and the length of a reading cannot be guessed.
 */
export class DictationPlayer {
  private state: PlayerSnapshot;
  private readonly listeners = new Set<(snapshot: PlayerSnapshot) => void>();
  private readonly timers: PlayerTimers;
  private timer: unknown;
  /** What a resume goes back to. */
  private pausedFrom: 'speaking' | 'waiting' = 'speaking';
  /** Bumped by every action, so that a reading ended by that action is ignored. */
  private run = 0;

  constructor(
    private readonly words: readonly DictationWord[],
    private readonly settings: PlayerSettings,
    private readonly deps: PlayerDependencies,
  ) {
    this.timers = deps.timers ?? browserTimers;
    this.state = {
      status: 'idle',
      index: 0,
      total: words.length,
      remainingMs: undefined,
      audioFailed: false,
    };
  }

  get snapshot(): PlayerSnapshot {
    return this.state;
  }

  subscribe(listener: (snapshot: PlayerSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  play(): void {
    if (this.state.status === 'idle') {
      this.read(0);
    }
  }

  next(): void {
    if (this.isStarted()) {
      this.read(this.state.index + 1);
    }
  }

  previous(): void {
    if (this.isStarted()) {
      this.read(Math.max(0, this.state.index - 1));
    }
  }

  pause(): void {
    const { status } = this.state;
    if (status === 'speaking' || status === 'waiting') {
      this.interrupt();
      this.pausedFrom = status;
      this.update({ status: 'paused' });
    }
  }

  resume(): void {
    if (this.state.status !== 'paused') {
      return;
    }
    if (this.pausedFrom === 'speaking') {
      this.read(this.state.index);
    } else {
      this.wait(this.state.remainingMs);
    }
  }

  togglePause(): void {
    if (this.state.status === 'paused') {
      this.resume();
    } else {
      this.pause();
    }
  }

  /** Reads the current word once more, slowly on request; replaying is never a hint. */
  repeat({ slow = false }: { slow?: boolean } = {}): void {
    if (!this.isStarted()) {
      return;
    }
    const rate = slow ? DICTATION_RATES.slow : this.settings.rate;
    this.read(this.state.index, { times: 1, rate });
  }

  /** Ends the dictation: nothing more is read. */
  stop(): void {
    this.interrupt();
    this.update({ status: 'finished', remainingMs: undefined });
  }

  private isStarted(): boolean {
    return this.state.status !== 'idle' && this.state.status !== 'finished';
  }

  private read(
    index: number,
    { times = this.settings.readingsPerWord, rate = this.settings.rate } = {},
  ): void {
    this.interrupt();
    const word = this.words[index];
    if (word === undefined) {
      this.update({ status: 'finished', remainingMs: undefined });
      return;
    }
    const run = this.run;
    this.update({ status: 'speaking', index, remainingMs: undefined });
    void this.speakTimes(word, { times, rate }, run);
  }

  private async speakTimes(
    word: DictationWord,
    { times, rate }: { times: number; rate: number },
    run: number,
  ): Promise<void> {
    try {
      for (let reading = 0; reading < times && run === this.run; reading++) {
        await this.deps.speaker.speak(word.text, word.language, { rate });
      }
    } catch {
      if (run === this.run) {
        this.update({ audioFailed: true });
      }
    }
    if (run === this.run) {
      this.wait(this.settings.delayMs);
    }
  }

  private wait(remainingMs: number | undefined): void {
    this.update({ status: 'waiting', remainingMs });
    if (remainingMs !== undefined) {
      this.tick(remainingMs);
    }
  }

  private tick(remainingMs: number): void {
    const step = Math.min(TICK_MS, remainingMs);
    this.timer = this.timers.setTimeout(() => {
      const left = remainingMs - step;
      if (left > 0) {
        this.update({ remainingMs: left });
        this.tick(left);
      } else {
        this.read(this.state.index + 1);
      }
    }, step);
  }

  /** Stops what is going on: the reading, the countdown, and any reading still to come. */
  private interrupt(): void {
    this.run += 1;
    this.timers.clearTimeout(this.timer);
    this.timer = undefined;
    if (this.state.status === 'speaking') {
      this.deps.speaker.cancel();
    }
  }

  private update(change: Partial<PlayerSnapshot>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

/** The part of `document` that tells whether the tab is visible. */
export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * Pauses the dictation when the tab is hidden, so that no word is missed; the learner resumes
 * it. Returns the function that stops watching.
 */
export function pauseWhenHidden(
  player: Pick<DictationPlayer, 'pause'>,
  page: VisibilitySource,
): () => void {
  const onChange = () => {
    if (page.hidden) {
      player.pause();
    }
  };
  page.addEventListener('visibilitychange', onChange);
  return () => {
    page.removeEventListener('visibilitychange', onChange);
  };
}
