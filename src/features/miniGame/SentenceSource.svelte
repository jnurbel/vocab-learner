<script lang="ts">
  import type { BankSentence } from '../../domain/sentence/sentenceData';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';

  interface Props {
    /** A sentence of the Tatoeba bank: its author and its translator are credited (CC BY). */
    sentence: BankSentence;
  }

  const { sentence }: Props = $props();

  /** A plain link: nothing is ever fetched from Tatoeba, the page opens only on a click. */
  const pageOf = (id: number) => `https://tatoeba.org/fr/sentences/show/${String(id)}`;
  const texts = fr.sentenceSource;
  const licence = $derived(sentence.cc0 ? texts.cc0 : texts.license);
  const converted = $derived(sentence.t2s ? ` · ${texts.converted}` : '');
</script>

<p class="source">
  <span class="visually-hidden">{texts.label} :</span>
  {texts.sentence}
  <a href={pageOf(sentence.id)} target="_blank" rel="noopener noreferrer"
    >{format(texts.number, { id: sentence.id })}</a
  >
  {format(texts.by, { author: sentence.author })} · {texts.translation}
  <a href={pageOf(sentence.translation.id)} target="_blank" rel="noopener noreferrer"
    >{format(texts.number, { id: sentence.translation.id })}</a
  >
  {format(texts.by, { author: sentence.translation.author })} · {licence}{converted}
</p>

<style>
  .source {
    margin: 0;
    color: var(--ink-soft);
    font-size: var(--text-sm);
  }

  .source a {
    display: inline-block;
    min-height: 44px;
    padding: var(--space-2) 0;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
