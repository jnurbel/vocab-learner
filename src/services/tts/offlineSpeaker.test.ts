import { describe, expect, it, vi } from 'vitest';
import { offlineAwareSpeaker, onlineOnlyLanguages, VoiceOfflineError } from './offlineSpeaker';
import type { Speaker, VoiceCatalog, VoiceInfo, VoiceReport } from './speaker';

const ONLINE_ZH: VoiceInfo = {
  name: 'Microsoft Xiaoxiao Online (Natural)',
  lang: 'zh-CN',
  localService: false,
};
const LOCAL_EN: VoiceInfo = { name: 'Microsoft Hazel', lang: 'en-GB', localService: true };
const UNTOLD_EN: VoiceInfo = { name: 'Old voice', lang: 'en-GB', localService: undefined };

function report(zh: VoiceInfo | undefined, en: VoiceInfo | undefined): VoiceReport {
  const voices = [zh, en].filter((voice) => voice !== undefined);
  return { voices, chosen: { zh, en } };
}

function fakeBase(voices: VoiceReport) {
  return {
    voiceReport: vi.fn(() => Promise.resolve(voices)),
    reloadVoices: vi.fn(() => Promise.resolve(voices)),
    hasVoice: vi.fn((language: 'zh' | 'en') =>
      Promise.resolve(voices.chosen[language] !== undefined),
    ),
    speak: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(),
    unlock: vi.fn(),
    setRate: vi.fn(),
  } satisfies Speaker & VoiceCatalog;
}

describe('onlineOnlyLanguages', () => {
  it('lists the languages read by an online voice', () => {
    expect(onlineOnlyLanguages(report(ONLINE_ZH, LOCAL_EN))).toEqual(['zh']);
  });

  it('takes a voice that does not tell where it runs as local, and no voice as no problem', () => {
    expect(onlineOnlyLanguages(report(undefined, UNTOLD_EN))).toEqual([]);
  });
});

describe('offlineAwareSpeaker', () => {
  it('reads with every voice while online', async () => {
    const base = fakeBase(report(ONLINE_ZH, LOCAL_EN));
    const speaker = offlineAwareSpeaker(base, () => true);

    expect(await speaker.hasVoice('zh')).toBe(true);
    await speaker.speak('你好', 'zh', { rate: 0.5 });

    expect(base.speak).toHaveBeenCalledWith('你好', 'zh', { rate: 0.5 });
  });

  it('offline, treats an online voice as missing, so that the word is written instead', async () => {
    const base = fakeBase(report(ONLINE_ZH, LOCAL_EN));
    const speaker = offlineAwareSpeaker(base, () => false);

    expect(await speaker.hasVoice('zh')).toBe(false);
    await expect(speaker.speak('你好', 'zh')).rejects.toBeInstanceOf(VoiceOfflineError);
    expect(base.speak).not.toHaveBeenCalled();
  });

  it('offline, still reads with a voice of the device', async () => {
    const base = fakeBase(report(ONLINE_ZH, LOCAL_EN));
    const speaker = offlineAwareSpeaker(base, () => false);

    expect(await speaker.hasVoice('en')).toBe(true);
    await speaker.speak('hello', 'en');

    expect(base.speak).toHaveBeenCalledWith('hello', 'en', undefined);
  });

  it('has no voice where the browser has none, online or not', async () => {
    const speaker = offlineAwareSpeaker(fakeBase(report(undefined, LOCAL_EN)), () => true);

    expect(await speaker.hasVoice('zh')).toBe(false);
  });

  it('passes the rest on to the browser voices', async () => {
    const voices = report(ONLINE_ZH, LOCAL_EN);
    const base = fakeBase(voices);
    const speaker = offlineAwareSpeaker(base, () => true);

    speaker.cancel();
    speaker.unlock();
    speaker.setRate(0.8);

    expect(base.cancel).toHaveBeenCalledTimes(1);
    expect(base.unlock).toHaveBeenCalledTimes(1);
    expect(base.setRate).toHaveBeenCalledWith(0.8);
    expect(await speaker.voiceReport()).toBe(voices);
    expect(await speaker.reloadVoices()).toBe(voices);
  });

  it('names the error for the logs', () => {
    expect(new VoiceOfflineError('zh')).toMatchObject({ name: 'VoiceOfflineError' });
  });
});
