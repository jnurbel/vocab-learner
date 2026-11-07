<script lang="ts">
  import type { Language } from '../../domain/card';
  import type { DiffPart } from '../../domain/dictation/characterDiff';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';

  interface Props {
    diff: readonly DiffPart[];
    language: Language;
  }

  const { diff, language }: Props = $props();

  const shown = (part: DiffPart) => (part.kind === 'missing' ? part.expected : part.given);
  const label = (part: DiffPart) =>
    format(fr.dictation.diffKinds[part.kind], {
      char: shown(part),
      expected: 'expected' in part ? part.expected : '',
    });
</script>

<!-- Right is underlined, wrong and extra are struck through, missing is dotted: never colour alone. -->
<ol
  class="diff"
  aria-label={fr.dictation.diffLabel[language]}
  lang={language === 'zh' ? 'zh-CN' : 'en'}
>
  {#each diff as part, index (index)}
    <li class="part diff-{part.kind}" aria-label={label(part)}>{shown(part)}</li>
  {/each}
</ol>

<style>
  .diff {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    list-style: none;
    padding: 0;
    margin: var(--space-2) 0 var(--space-3);
    font-size: var(--text-hanzi);
    line-height: 1.3;
  }

  .part {
    padding: 0 0.1rem;
    text-underline-offset: 0.2em;
    text-decoration-thickness: 0.07em;
  }

  /* As in docs/ui/mockups/ExListenTypeWrong.dc.html: the marks carry the meaning, the colour doubles them. */
  .diff-correct {
    color: var(--jade-strong);
    text-decoration-line: underline;
    text-decoration-color: var(--jade);
  }

  .diff-wrong,
  .diff-extra {
    color: var(--ochre);
    text-decoration-line: line-through;
  }

  .diff-extra {
    text-decoration-style: double;
  }

  .diff-missing {
    color: var(--muted);
    border-bottom: 0.07em dotted currentColor;
  }
</style>
