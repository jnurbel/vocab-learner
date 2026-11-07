<script lang="ts">
  import { onMount } from 'svelte';
  import type { Language } from '../../domain/card';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import {
    isSpeechBlocked,
    type Speaker,
    type VoiceCatalog,
    type VoiceInfo,
    type VoiceReport,
  } from '../../services/tts/speaker';
  import VoiceHelp from '../../ui/VoiceHelp.svelte';

  interface Props {
    /** Reads the samples. */
    speaker: Speaker;
    /** Lists the voices of the browser. */
    voices: VoiceCatalog;
  }

  const { speaker, voices }: Props = $props();

  /** What the test buttons read: hello in each language. */
  const SAMPLES: Readonly<Record<Language, string>> = { zh: '你好', en: 'hello' };

  let report = $state.raw<VoiceReport>();
  let loading = $state(false);
  let testStatus = $state<keyof typeof fr.voice.testStatus>();

  onMount(() => {
    void load(() => voices.voiceReport());
  });

  async function load(read: () => Promise<VoiceReport>) {
    loading = true;
    try {
      report = await read();
    } finally {
      loading = false;
    }
  }

  /** Called in the click itself: a phone speaks only when unlocked during a user gesture. */
  function test(language: Language) {
    speaker.unlock();
    testStatus = undefined;
    speaker.speak(SAMPLES[language], language).catch((caught: unknown) => {
      if (isSpeechBlocked(caught)) {
        testStatus = 'blocked';
      } else {
        testStatus = report?.chosen[language] === undefined ? 'noVoice' : 'failed';
      }
    });
  }

  const isSame = (voice: VoiceInfo, other: VoiceInfo | undefined) =>
    voice.name === other?.name && voice.lang === other.lang;

  function serviceOf(voice: VoiceInfo): string {
    if (voice.localService === undefined) {
      return fr.voice.unknownService;
    }
    return voice.localService ? fr.voice.local : fr.voice.online;
  }
</script>

<section aria-labelledby="voice-title" class="voices">
  <h2 id="voice-title">{fr.voice.title}</h2>
  <p class="help">{fr.voice.intro}</p>

  <div class="actions">
    <button
      type="button"
      onclick={() => {
        test('zh');
      }}>{fr.voice.testZh}</button
    >
    <button
      type="button"
      onclick={() => {
        test('en');
      }}>{fr.voice.testEn}</button
    >
    <button type="button" disabled={loading} onclick={() => load(() => voices.reloadVoices())}
      >{fr.voice.reload}</button
    >
  </div>
  <p aria-live="polite">
    {#if testStatus !== undefined}{fr.voice.testStatus[testStatus]}{/if}
  </p>

  {#if report !== undefined}
    {#if report.chosen.zh === undefined}
      <p class="notice">{fr.voice.noChinese}</p>
      <VoiceHelp language="zh" open />
    {/if}
    {#if report.voices.length === 0}
      <p>{fr.voice.none}</p>
    {:else}
      <h3 id="voice-list-title">{format(fr.voice.detected, { count: report.voices.length })}</h3>
      <ul aria-labelledby="voice-list-title" class="voice-list">
        {#each report.voices as voice, index (index)}
          {@const forZh = isSame(voice, report.chosen.zh)}
          {@const forEn = isSame(voice, report.chosen.en)}
          <li class={{ chosen: forZh || forEn }}>
            <span class="name">{voice.name}</span>
            <code>{voice.lang}</code>
            <span class="service">{serviceOf(voice)}</span>
            {#if forZh}<strong>{fr.voice.chosenZh}</strong>{/if}
            {#if forEn}<strong>{fr.voice.chosenEn}</strong>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .voices {
    margin-top: var(--space-6);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .help,
  .service {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .notice {
    color: var(--thirst);
    font-weight: var(--weight-bold);
  }

  .voice-list {
    padding: 0;
    list-style: none;
  }

  .voice-list li {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: baseline;
    padding: var(--space-2);
    border-bottom: 1px solid var(--line);
  }

  .voice-list li.chosen {
    border-left: 4px solid var(--jade);
    font-weight: var(--weight-heavy);
  }
</style>
