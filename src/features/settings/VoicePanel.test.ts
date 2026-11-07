import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { format } from '../../i18n/format';
import fr from '../../i18n/fr.json';
import { createWebSpeechSpeaker, SpeechBlockedError } from '../../services/tts/speaker';
import { fakeSpeech } from '../../services/tts/speech.fixtures';
import VoicePanel from './VoicePanel.svelte';

const MANDARIN = { name: 'Chinese China', lang: 'cmn_CN', localService: false };
const ANDROID_VOICES = [
  { name: 'English United Kingdom', lang: 'en_GB', localService: true },
  { name: 'Chinese Taiwan', lang: 'zh_TW', localService: true },
  { name: 'Mystery', lang: 'fr-FR' },
];

function setup(options: Parameters<typeof fakeSpeech>[0] = {}) {
  const speech = fakeSpeech(options);
  const speaker = createWebSpeechSpeaker(speech.host, { leadInMs: 0 });
  render(VoicePanel, { speaker, voices: speaker });
  return { speech, speaker, user: userEvent.setup() };
}

const list = () => screen.findByRole('list', { name: format(fr.voice.detected, { count: 4 }) });

describe('VoicePanel', () => {
  it('lists the voices of the browser and marks those used for Chinese and English', async () => {
    setup({ voices: [...ANDROID_VOICES, MANDARIN] });

    const items = within(await list()).getAllByRole('listitem');

    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('English United Kingdom');
    expect(items[0]).toHaveTextContent('en_GB');
    expect(items[0]).toHaveTextContent(fr.voice.local);
    expect(items[0]).toHaveTextContent(fr.voice.chosenEn);
    expect(items[1]).not.toHaveTextContent(fr.voice.chosenZh);
    expect(items[2]).toHaveTextContent(fr.voice.unknownService);
    expect(items[3]).toHaveTextContent(fr.voice.online);
    expect(items[3]).toHaveTextContent(fr.voice.chosenZh);
    expect(screen.queryByText(fr.voice.noChinese)).toBeNull();
  });

  it('explains how to install the Chinese voice when there is none', async () => {
    setup({ voices: ANDROID_VOICES });

    expect(await screen.findByText(fr.voice.noChinese)).toBeVisible();
    expect(screen.getByText(fr.voice.missingHelpAndroid)).toBeVisible();
  });

  it('says when the browser found no voice at all', async () => {
    setup({ voices: [], lateVoices: [] });

    expect(await screen.findByText(fr.voice.none, {}, { timeout: 3_000 })).toBeVisible();
  });

  it('reads a Chinese and an English sample, unlocking the speech in the click', async () => {
    const { speech, user } = setup({ voices: [...ANDROID_VOICES, MANDARIN], requireGesture: true });
    await list();

    const zh = screen.getByRole('button', { name: fr.voice.testZh });
    speech.gesture(() => {
      zh.click();
    });
    await vi.waitFor(() => {
      expect(speech.heard).toEqual(['你好']);
    });
    speech.endCurrent();
    await user.click(screen.getByRole('button', { name: fr.voice.testEn }));

    await vi.waitFor(() => {
      expect(speech.heard).toEqual(['你好', 'hello']);
    });
    expect(speech.spoken.at(-1)?.voice?.name).toBe('English United Kingdom');
  });

  it('says why a sample could not be read', async () => {
    const { speaker, user } = setup({ voices: ANDROID_VOICES });
    await screen.findByText(fr.voice.noChinese);

    await user.click(screen.getByRole('button', { name: fr.voice.testZh }));
    expect(await screen.findByText(fr.voice.testStatus.noVoice)).toBeVisible();

    vi.spyOn(speaker, 'speak').mockRejectedValueOnce(new SpeechBlockedError());
    await user.click(screen.getByRole('button', { name: fr.voice.testEn }));
    expect(await screen.findByText(fr.voice.testStatus.blocked)).toBeVisible();

    vi.spyOn(speaker, 'speak').mockRejectedValueOnce(new Error('Speech failed'));
    await user.click(screen.getByRole('button', { name: fr.voice.testEn }));
    expect(await screen.findByText(fr.voice.testStatus.failed)).toBeVisible();
  });

  it('reloads the voice list on demand, e.g. once the Chinese voice is installed', async () => {
    const { speech, user } = setup({
      voices: ANDROID_VOICES,
      lateVoices: [...ANDROID_VOICES, MANDARIN],
    });
    await screen.findByText(fr.voice.noChinese);
    speech.deliverLateVoicesSilently();

    await user.click(screen.getByRole('button', { name: fr.voice.reload }));

    expect(within(await list()).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByText(fr.voice.noChinese)).toBeNull();
  });
});
