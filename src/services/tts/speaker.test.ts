import { describe, expect, it, vi } from 'vitest';
import {
  createWebSpeechSpeaker,
  pickVoice,
  type SpeechHost,
  type UtteranceLike,
  type VoiceLike,
} from './speaker';

const voice = (lang: string, name = lang): VoiceLike => ({ lang, name });

class FakeUtterance implements UtteranceLike {
  lang = '';
  rate = 1;
  voice: VoiceLike | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(readonly text: string) {}
}

/** A fake speechSynthesis whose voices may arrive late, like in Chrome. */
function fakeHost(initialVoices: VoiceLike[], lateVoices?: VoiceLike[]) {
  let voices = initialVoices;
  const listeners: (() => void)[] = [];
  const spoken: FakeUtterance[] = [];
  const synthesis = {
    getVoices: () => voices,
    addEventListener: (_type: 'voiceschanged', listener: () => void) => {
      listeners.push(listener);
    },
    removeEventListener: vi.fn(),
    speak: (utterance: FakeUtterance) => {
      spoken.push(utterance);
    },
    cancel: vi.fn(),
  };
  const host: SpeechHost = {
    speechSynthesis: synthesis,
    createUtterance: (text) => new FakeUtterance(text),
  };
  const deliverLateVoices = () => {
    voices = lateVoices ?? [];
    listeners.forEach((listener) => {
      listener();
    });
  };
  return { host, synthesis, spoken, deliverLateVoices };
}

describe('pickVoice', () => {
  it('picks a mainland Mandarin voice for Chinese, whatever the case or separator', () => {
    const voices = [voice('zh-TW'), voice('zh_cn', 'Huihui'), voice('en-GB')];

    expect(pickVoice(voices, 'zh')?.name).toBe('Huihui');
  });

  it('prefers a British voice for English, as taught in French schools', () => {
    const voices = [voice('en-US', 'Zira'), voice('en-GB', 'Hazel')];

    expect(pickVoice(voices, 'en')?.name).toBe('Hazel');
  });

  it('falls back to another English voice when there is no British one', () => {
    expect(pickVoice([voice('fr-FR'), voice('en-US', 'Zira')], 'en')?.name).toBe('Zira');
  });

  it('finds no voice when the language is not installed', () => {
    expect(pickVoice([voice('fr-FR'), voice('zh-TW')], 'zh')).toBeUndefined();
  });
});

describe('the Web Speech speaker', () => {
  it('has no voice in a browser without speech synthesis', async () => {
    const speaker = createWebSpeechSpeaker({});

    expect(await speaker.hasVoice('zh')).toBe(false);
    await expect(speaker.speak('你好', 'zh')).rejects.toThrow('No voice');
  });

  it('waits for the voices that the browser loads late', async () => {
    const { host, deliverLateVoices } = fakeHost([], [voice('zh-CN')]);
    const speaker = createWebSpeechSpeaker(host, { voicesTimeoutMs: 10_000 });

    const answer = speaker.hasVoice('zh');
    deliverLateVoices();

    expect(await answer).toBe(true);
  });

  it('gives up waiting after a while, and then has no voice', async () => {
    vi.useFakeTimers();
    try {
      const { host } = fakeHost([]);
      const speaker = createWebSpeechSpeaker(host, { voicesTimeoutMs: 1_000 });

      const answer = speaker.hasVoice('zh');
      await vi.advanceTimersByTimeAsync(1_000);

      expect(await answer).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('speaks a word with the chosen voice and resolves when it ends', async () => {
    const { host, synthesis, spoken } = fakeHost([voice('zh-CN', 'Huihui')]);
    const speaker = createWebSpeechSpeaker(host, { rate: 0.85 });

    const speaking = speaker.speak('你好', 'zh');
    await vi.waitFor(() => {
      expect(spoken).toHaveLength(1);
    });
    const [utterance] = spoken;
    expect(utterance).toMatchObject({ text: '你好', lang: 'zh-CN', rate: 0.85 });
    expect(utterance?.voice?.name).toBe('Huihui');
    expect(synthesis.cancel).toHaveBeenCalled();
    utterance?.onend?.();

    await expect(speaking).resolves.toBeUndefined();
  });

  it('reads a word at the speed asked for this reading, e.g. slowly', async () => {
    const { host, spoken } = fakeHost([voice('zh-CN')]);
    const speaker = createWebSpeechSpeaker(host, { rate: 0.85 });

    void speaker.speak('你好', 'zh', { rate: 0.6 });
    await vi.waitFor(() => {
      expect(spoken).toHaveLength(1);
    });

    expect(spoken[0]?.rate).toBe(0.6);
  });

  it('resolves quietly when a word is interrupted by the next one', async () => {
    const { host, spoken } = fakeHost([voice('en-GB')]);
    const speaker = createWebSpeechSpeaker(host);

    const speaking = speaker.speak('apple', 'en');
    await vi.waitFor(() => {
      expect(spoken).toHaveLength(1);
    });
    spoken[0]?.onerror?.({ error: 'interrupted' });

    await expect(speaking).resolves.toBeUndefined();
  });

  it('fails when the voice cannot be played', async () => {
    const { host, spoken } = fakeHost([voice('en-GB')]);
    const speaker = createWebSpeechSpeaker(host);

    const speaking = speaker.speak('apple', 'en');
    await vi.waitFor(() => {
      expect(spoken).toHaveLength(1);
    });
    spoken[0]?.onerror?.({ error: 'synthesis-failed' });

    await expect(speaking).rejects.toThrow('synthesis-failed');
  });

  it('refuses to speak a language without a voice, so that the word is shown instead', async () => {
    const { host, spoken } = fakeHost([voice('fr-FR')]);
    const speaker = createWebSpeechSpeaker(host);

    await expect(speaker.speak('你好', 'zh')).rejects.toThrow('No voice');
    expect(spoken).toEqual([]);
  });

  it('stops speaking on demand', () => {
    const { host, synthesis } = fakeHost([voice('zh-CN')]);

    createWebSpeechSpeaker(host).cancel();

    expect(synthesis.cancel).toHaveBeenCalled();
  });
});
