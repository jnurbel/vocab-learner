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
    gap: 0.15rem;
    list-style: none;
    padding: 0;
    margin: 0.5rem 0;
    font-size: 2rem;
  }

  .part {
    padding: 0 0.1rem;
    text-underline-offset: 0.2em;
    text-decoration-thickness: 0.08em;
  }

  .diff-correct {
    color: #1b5e20;
    text-decoration-line: underline;
  }

  .diff-wrong,
  .diff-extra {
    color: #8a4b00;
    text-decoration-line: line-through;
  }

  .diff-extra {
    text-decoration-style: double;
  }

  .diff-missing {
    color: #5f5f5f;
    border-bottom: 0.08em dotted currentColor;
  }

  @media (prefers-color-scheme: dark) {
    .diff-correct {
      color: #a5d6a7;
    }

    .diff-wrong,
    .diff-extra {
      color: #ffcc80;
    }

    .diff-missing {
      color: #c7c7c7;
    }
  }
</style>
