<script lang="ts">
  import type { Card, Language } from '../../domain/card';
  import { miniGameCatalog, type MiniGame } from '../../domain/game/miniGameCatalog';
  import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
  import { formatCount } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { Speaker } from '../../services/tts/speaker';

  interface Props {
    cards: readonly Card[];
    speaker: Speaker;
    /** Opens a game on every word of the language. */
    onOpen: (game: MiniGame, language: Language) => void;
    language?: Language;
  }

  const { cards, speaker, onOpen, language: initialLanguage = 'zh' }: Props = $props();

  const LANGUAGES: readonly Language[] = ['zh', 'en'];

  // svelte-ignore state_referenced_locally
  let language = $state<Language>(initialLanguage);
  /** Whether a voice reads the language: the tone game is hidden without one (GAME_DESIGN.md 6.3). */
  let voice = $state<boolean>();

  $effect(() => {
    const asked = language;
    voice = undefined;
    speaker
      .hasVoice(asked)
      .then((found) => {
        if (asked === language) {
          voice = found;
        }
      })
      .catch(() => {
        voice = false;
      });
  });

  const entries = $derived(
    miniGameCatalog(cards, language, MINI_GAME_CONFIG).filter(
      ({ game }) => game !== 'toneEcho' || voice === true,
    ),
  );

  function nameOf(game: MiniGame): string {
    const texts = fr.miniGames.games[game];
    return game === 'toneEcho' && language === 'en'
      ? fr.miniGames.games.toneEcho.nameEn
      : texts.name;
  }

  function descriptionOf(game: MiniGame): string {
    return game === 'toneEcho' && language === 'en'
      ? fr.miniGames.games.toneEcho.descriptionEn
      : fr.miniGames.games[game].description;
  }
</script>

<section aria-labelledby="mini-games-title" class="mini-games">
  <h2 id="mini-games-title">{fr.miniGames.title}</h2>
  <p>{fr.miniGames.intro}</p>

  <fieldset>
    <legend>{fr.miniGames.languageLegend}</legend>
    {#each LANGUAGES as code (code)}
      <label class="choice">
        <input type="radio" name="mini-games-language" value={code} bind:group={language} />
        {fr.languages[code]}
      </label>
    {/each}
  </fieldset>

  <ul class="games" aria-label={fr.miniGames.listLabel}>
    {#each entries as entry (entry.game)}
      <li class="game" class:closed={!entry.open}>
        <h3 id="mini-game-{entry.game}">{nameOf(entry.game)}</h3>
        <p>{descriptionOf(entry.game)}</p>
        <p class="count">{formatCount(fr.miniGames.eligible, entry.eligibleWords)}</p>
        {#if !entry.open}
          <p class="reason" id="mini-game-{entry.game}-reason">
            {fr.miniGames.reasons[entry.reason]}
          </p>
        {/if}
        <button
          type="button"
          class="primary"
          disabled={!entry.open}
          aria-describedby={entry.open ? undefined : `mini-game-${entry.game}-reason`}
          onclick={() => {
            onOpen(entry.game, language);
          }}>{fr.miniGames.play}<span class="visually-hidden"> {nameOf(entry.game)}</span></button
        >
      </li>
    {/each}
  </ul>
</section>

<style>
  fieldset {
    margin: 0 0 var(--space-4);
  }

  .games {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .game {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }

  .game h3,
  .game p {
    margin: 0;
  }

  .game button {
    align-self: flex-start;
    margin-top: auto;
  }

  .count {
    color: var(--jade-strong);
    font-weight: var(--weight-bold);
  }

  .closed {
    background: var(--surface-2);
  }

  .reason {
    color: var(--ochre);
    font-weight: var(--weight-bold);
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
