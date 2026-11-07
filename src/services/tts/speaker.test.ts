import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWebSpeechSpeaker,
  isSpeechBlocked,
  pickVoice,
  SpeechBlockedError,
  type SpeakerOptions,
  type SpeechHost,
} from './speaker';
import { fakeSpeech, voice } from './speech.fixtures';

/** No silence before the words, so that the tests need no clock unless they check it. */
const speakerOf = (host: SpeechHost, options: SpeakerOptions = {}) =>
  createWebSpeechSpeaker(host, { leadInMs: 0, ...options });

afterEach(() => {
  vi.useRealTimers();
});

describe('pickVoice', () => {
  it('picks a mainland Mandarin voice for Chinese, whatever the case or separator', () => {
    const voices = [voice('zh-TW'), voice('zh_cn', 'Huihui'), voice('en-GB')];

    expect(pickVoice(voices, 'zh')?.name).toBe('Huihui');
  });

  it.each([
    'zh-CN',
    'zh_CN',
    'ZH-cn',
    'cmn-CN',
    'cmn_CN',
    'cmn-Hans-CN',
    'zh-Hans-CN',
    'zh_CN_#Hans',
  ])('understands the Mandarin tag %s of Android and iOS voices', (lang) => {
    expect(pickVoice([voice(lang, 'Mandarin')], 'zh')?.name).toBe('Mandarin');
  });

  it.each(['yue', 'yue-HK', 'zh-HK', 'zh_TW', 'zh-Hant-TW', 'cmn-Hant-TW', 'zh-Hant'])(
    'never reads Mandarin with the voice %s (Cantonese or Taiwan)',
    (lang) => {
      expect(pickVoice([voice(lang)], 'zh')).toBeUndefined();
    },
  );

  it('prefers a mainland voice to a Mandarin voice without a region', () => {
    const voices = [voice('yue-HK'), voice('cmn', 'Plain'), voice('zh-TW'), voice('cmn-CN', 'CN')];

    expect(pickVoice(voices, 'zh')?.name).toBe('CN');
    expect(pickVoice([voice('zh-HK'), voice('cmn', 'Plain')], 'zh')?.name).toBe('Plain');
  });

  it('understands the English tags of Android voices too', () => {
    expect(pickVoice([voice('en_US', 'US'), voice('en_GB', 'GB')], 'en')?.name).toBe('GB');
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
    expect(() => {
      speaker.unlock();
    }).not.toThrow();
  });

  it('waits for the voices that the browser loads late', async () => {
    const { host, deliverLateVoices } = fakeSpeech({ lateVoices: [voice('zh-CN')] });
    const speaker = speakerOf(host, { voicesTimeoutMs: 10_000 });

    const answer = speaker.hasVoice('zh');
    deliverLateVoices();

    expect(await answer).toBe(true);
  });

  it('gives up waiting after a while, then looks again the next time', async () => {
    vi.useFakeTimers();
    const { host, deliverLateVoices } = fakeSpeech({ lateVoices: [voice('zh-CN')] });
    const speaker = speakerOf(host, { voicesTimeoutMs: 1_000 });

    const answer = speaker.hasVoice('zh');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await answer).toBe(false);

    // A phone may announce its voices after the timeout: an empty list is not kept.
    const later = speaker.hasVoice('zh');
    deliverLateVoices();
    expect(await later).toBe(true);
  });

  it('speaks a word with the chosen voice and resolves when it ends', async () => {
    const speech = fakeSpeech({ voices: [voice('zh-CN', 'Huihui')] });
    const speaker = speakerOf(speech.host, { rate: 0.85 });

    const speaking = speaker.speak('你好', 'zh');
    await vi.waitFor(() => {
      expect(speech.spoken).toHaveLength(1);
    });
    const [utterance] = speech.spoken;
    expect(utterance).toMatchObject({ text: '你好', lang: 'zh-CN', rate: 0.85 });
    expect(utterance?.voice?.name).toBe('Huihui');
    speech.endCurrent();

    await expect(speaking).resolves.toBeUndefined();
  });

  it('reads a word at the speed asked for this reading, e.g. slowly', async () => {
    const speech = fakeSpeech({ voices: [voice('zh-CN')] });
    const speaker = speakerOf(speech.host, { rate: 0.85 });

    void speaker.speak('你好', 'zh', { rate: 0.6 });
    await vi.waitFor(() => {
      expect(speech.spoken).toHaveLength(1);
    });

    expect(speech.spoken[0]?.rate).toBe(0.6);
  });

  it('resolves quietly when a word is interrupted by the next one', async () => {
    const speech = fakeSpeech({ voices: [voice('en-GB')] });
    const speaker = speakerOf(speech.host);

    const speaking = speaker.speak('apple', 'en');
    await vi.waitFor(() => {
      expect(speech.spoken).toHaveLength(1);
    });
    speech.spoken[0]?.onerror?.({ error: 'interrupted' });

    await expect(speaking).resolves.toBeUndefined();
  });

  it('fails when the voice cannot be played', async () => {
    const speech = fakeSpeech({ voices: [voice('en-GB')] });
    const speaker = speakerOf(speech.host);

    const speaking = speaker.speak('apple', 'en');
    await vi.waitFor(() => {
      expect(speech.spoken).toHaveLength(1);
    });
    speech.spoken[0]?.onerror?.({ error: 'synthesis-failed' });

    await expect(speaking).rejects.toThrow('synthesis-failed');
  });

  it('refuses to speak a language without a voice, rather than read it with another voice', async () => {
    // An Android phone without the Chinese voice data: only French and English voices.
    const speech = fakeSpeech({ voices: [voice('fr-FR'), voice('en-GB')] });
    const speaker = speakerOf(speech.host);

    expect(await speaker.hasVoice('zh')).toBe(false);
    await expect(speaker.speak('你好', 'zh')).rejects.toThrow('No voice for zh');
    expect(speech.synthesis.speak).not.toHaveBeenCalled();
  });

  it('stops speaking on demand, including a word still waiting for its turn', async () => {
    vi.useFakeTimers();
    const speech = fakeSpeech({ voices: [voice('zh-CN')] });
    const speaker = createWebSpeechSpeaker(speech.host, { leadInMs: 300 });

    const speaking = speaker.speak('你好', 'zh');
    await vi.advanceTimersByTimeAsync(100);
    speaker.cancel();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(speaking).resolves.toBeUndefined();
    expect(speech.synthesis.cancel).toHaveBeenCalled();
    expect(speech.spoken).toEqual([]);
  });
});

describe('the speaker on a phone, where speech needs a user gesture', () => {
  it('reports a reading refused by Chrome Android (not-allowed) instead of hiding it', async () => {
    const speech = fakeSpeech({ voices: [voice('zh-CN')] });
    const speaker = speakerOf(speech.host);

    const speaking = speaker.speak('你好', 'zh');
    await vi.waitFor(() => {
      expect(speech.spoken.filter(({ text }) => text === '你好')).toHaveLength(1);
    });
    speech.spoken[0]?.onerror?.({ error: 'not-allowed' });

    const error: unknown = await speaking.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SpeechBlockedError);
    expect(isSpeechBlocked(error)).toBe(true);
    expect(isSpeechBlocked(new Error('Speech failed: synthesis-failed'))).toBe(false);
  });

  it('unlocks again after a refused reading, on the next gesture', async () => {
    const speech = fakeSpeech({ voices: [voice('zh-CN')] });
    const speaker = speakerOf(speech.host);
    speaker.unlock();

    const speaking = speaker.speak('你好', 'zh');
    await vi.waitFor(() => {
      expect(speech.heard).toEqual(['你好']);
    });
    speech.spoken.at(-1)?.onerror?.({ error: 'not-allowed' });
    await speaking.catch(() => undefined);
    speaker.unlock();

    expect(speech.spoken.map(({ text }) => text)).toEqual([' ', '你好', ' ']);
  });

  it('resumes the synthesis before each word, as Chrome pauses it by itself', async () => {
    const speech = fakeSpeech({ voices: [voice('zh-CN')] });
    const speaker = speakerOf(speech.host);

    void speaker.speak('你好', 'zh');
    await vi.waitFor(() => {
      expect(speech.heard).toEqual(['你好']);
    });

    const [resumed] = speech.synthesis.resume.mock.invocationCallOrder;
    const [spoken] = speech.synthesis.speak.mock.invocationCallOrder;
    expect(resumed).toBeLessThan(spoken ?? 0);
  });

  it('plays nothing when the first word is spoken after an await, outside the click', async () => {
    // The bug as the learner met it: the browser drops the utterance without any error.
    const speech = fakeSpeech({ lateVoices: [voice('zh-CN')], requireGesture: true });
    const speaker = speakerOf(speech.host);

    speech.gesture(() => {
      void speaker.speak('你好', 'zh');
    });
    speech.deliverLateVoices();

    await vi.waitFor(() => {
      expect(speech.dropped.map(({ text }) => text)).toEqual(['你好']);
    });
    expect(speech.heard).toEqual([]);
  });

  it('plays the first word once unlocked during the click, even if the voices come late', async () => {
    const speech = fakeSpeech({ lateVoices: [voice('zh-CN')], requireGesture: true });
    const speaker = speakerOf(speech.host);

    speech.gesture(() => {
      speaker.unlock();
      void speaker.speak('你好', 'zh');
    });
    speech.deliverLateVoices();

    await vi.waitFor(() => {
      expect(speech.heard).toEqual(['你好']);
    });
    expect(speech.dropped).toEqual([]);
    expect(speech.synthesis.resume).toHaveBeenCalled();
  });

  it('unlocks with a blank utterance at normal volume, once per page', () => {
    const speech = fakeSpeech({ voices: [voice('zh-CN')], requireGesture: true });
    const speaker = speakerOf(speech.host);

    speech.gesture(() => {
      speaker.unlock();
    });
    speech.gesture(() => {
      speaker.unlock();
    });

    expect(speech.spoken.map(({ text }) => text)).toEqual([' ']);
    expect(speech.synthesis.resume).toHaveBeenCalledTimes(2);
  });

  it('later words, started by timers, are heard once unlocked', async () => {
    vi.useFakeTimers();
    const speech = fakeSpeech({ voices: [voice('zh-CN')], requireGesture: true });
    const speaker = speakerOf(speech.host);
    speech.gesture(() => {
      speaker.unlock();
    });

    setTimeout(() => void speaker.speak('猫', 'zh'), 5_000);
    await vi.advanceTimersByTimeAsync(5_100);

    expect(speech.heard).toEqual(['猫']);
  });

  it('does not cancel when nothing is being said', async () => {
    const speech = fakeSpeech({ voices: [voice('zh-CN')] });
    const speaker = speakerOf(speech.host);

    void speaker.speak('你好', 'zh');
    await vi.waitFor(() => {
      expect(speech.heard).toEqual(['你好']);
    });

    expect(speech.synthesis.cancel).not.toHaveBeenCalled();
  });

  it('leaves a short silence between cancelling a word and speaking the next, for Safari', async () => {
    vi.useFakeTimers();
    // Safari loses an utterance spoken within a few ms of cancel().
    const speech = fakeSpeech({ voices: [voice('zh-CN')], cancelSettleMs: 50 });
    const speaker = createWebSpeechSpeaker(speech.host);

    void speaker.speak('再', 'zh');
    await vi.advanceTimersByTimeAsync(1_000);
    void speaker.speak('猫', 'zh');
    await vi.advanceTimersByTimeAsync(1_000);

    expect(speech.synthesis.cancel).toHaveBeenCalledTimes(1);
    expect(speech.heard).toEqual(['再', '猫']);
    expect(speech.dropped).toEqual([]);
  });

  it('waits about 300 ms before each word, so that its start is not cut off', async () => {
    vi.useFakeTimers();
    const speech = fakeSpeech({ voices: [voice('zh-CN')] });
    const speaker = createWebSpeechSpeaker(speech.host);

    void speaker.speak('你好', 'zh');
    await vi.advanceTimersByTimeAsync(299);
    expect(speech.heard).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(speech.heard).toEqual(['你好']);
  });

  it('gives up waiting for an end that never comes, as on Chrome Android', async () => {
    vi.useFakeTimers();
    const speech = fakeSpeech({ voices: [voice('zh-CN')] });
    const speaker = speakerOf(speech.host, { rate: 1 });
    let ended = false;

    void speaker.speak('你好', 'zh').then(() => {
      ended = true;
    });
    // Never ended by the fake: the browser lost the `onend` event.
    await vi.advanceTimersByTimeAsync(3_999);
    expect(ended).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(ended).toBe(true);
  });

  it('waits longer for a long text read slowly before giving up', async () => {
    vi.useFakeTimers();
    const speech = fakeSpeech({ voices: [voice('en-GB')] });
    const speaker = speakerOf(speech.host);
    let ended = false;

    void speaker.speak('necessary', 'en', { rate: 0.5 }).then(() => {
      ended = true;
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ended).toBe(false);
    // (3 s + 9 letters x 0.5 s) / 0.5 = 15 s.
    await vi.advanceTimersByTimeAsync(5_000);

    expect(ended).toBe(true);
  });
});

/** Voices as Chrome on an Android phone lists them, with Google's speech engine. */
const ANDROID_VOICES = [
  { name: 'English United States', lang: 'en_US', localService: true },
  { name: 'English United Kingdom', lang: 'en_GB', localService: true },
  { name: 'français France', lang: 'fr_FR', localService: true },
  { name: 'Chinese Hong Kong', lang: 'yue_HK', localService: true },
  { name: 'Chinese Taiwan', lang: 'zh_TW', localService: true },
  { name: 'Chinese China', lang: 'cmn_CN', localService: false },
];

describe('pickVoice on an Android phone', () => {
  it('picks the mainland Mandarin and the British voices of a real list', () => {
    expect(pickVoice(ANDROID_VOICES, 'zh')?.name).toBe('Chinese China');
    expect(pickVoice(ANDROID_VOICES, 'en')?.name).toBe('English United Kingdom');
  });

  it('finds no Chinese voice before the Chinese voice data is installed', () => {
    const withoutMandarin = ANDROID_VOICES.filter(({ name }) => name !== 'Chinese China');

    expect(pickVoice(withoutMandarin, 'zh')).toBeUndefined();
  });
});

describe('the voices found by the speaker', () => {
  it('reports every voice, and the one picked for each language', async () => {
    const { host } = fakeSpeech({ voices: ANDROID_VOICES });
    const speaker = speakerOf(host);

    const report = await speaker.voiceReport();

    expect(report.voices).toHaveLength(6);
    expect(report.voices[5]).toEqual({
      name: 'Chinese China',
      lang: 'cmn_CN',
      localService: false,
    });
    expect(report.chosen.zh?.name).toBe('Chinese China');
    expect(report.chosen.en?.name).toBe('English United Kingdom');
  });

  it('reports no voice in a browser without speech synthesis', async () => {
    const report = await createWebSpeechSpeaker({}).reloadVoices();

    expect(report).toEqual({ voices: [], chosen: { zh: undefined, en: undefined } });
  });

  it('never keeps "no Chinese voice": the next session asks the browser again', async () => {
    const speech = fakeSpeech({
      voices: [voice('en-GB')],
      lateVoices: [voice('en-GB'), voice('zh-CN')],
    });
    const speaker = speakerOf(speech.host);
    expect(await speaker.hasVoice('zh')).toBe(false);

    // The voice was installed meanwhile; this browser lists it without any event.
    speech.deliverLateVoicesSilently();

    expect(await speaker.hasVoice('zh')).toBe(true);
  });

  it('forgets the voice list when the browser announces a change', async () => {
    const speech = fakeSpeech({
      voices: [voice('zh-CN', 'Old')],
      lateVoices: [voice('zh-CN', 'New')],
    });
    const speaker = speakerOf(speech.host);
    expect((await speaker.voiceReport()).chosen.zh?.name).toBe('Old');

    speech.deliverLateVoices();

    expect((await speaker.voiceReport()).chosen.zh?.name).toBe('New');
  });

  it('reloads the voice list on demand, without the cache', async () => {
    const speech = fakeSpeech({
      voices: [voice('zh-CN', 'Old')],
      lateVoices: [voice('zh-CN', 'New')],
    });
    const speaker = speakerOf(speech.host);
    await speaker.voiceReport();

    speech.deliverLateVoicesSilently();

    expect((await speaker.reloadVoices()).chosen.zh?.name).toBe('New');
  });
});
