<script lang="ts" module>
  /** The menu entries that have an icon. */
  export type NavIconName = 'words' | 'garden' | 'flashcards' | 'dictation' | 'backup' | 'settings';
</script>

<script lang="ts">
  interface Props {
    name: NavIconName;
  }

  const { name }: Props = $props();
</script>

<!-- Decorative: the menu entry's text names it. -->
<svg
  class="nav-icon"
  viewBox="0 0 24 24"
  width="22"
  height="22"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if name === 'words'}
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
  {:else if name === 'garden'}
    <path d="M12 21v-9" />
    <path d="M12 12c0-4 3-7 7-7 0 4-3 7-7 7z" />
    <path d="M12 15c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5z" />
    <path d="M5 21h14" />
  {:else if name === 'flashcards'}
    <rect x="3" y="7" width="13" height="14" rx="2" />
    <path d="M8 3h11a2 2 0 0 1 2 2v12" />
  {:else if name === 'dictation'}
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />
  {:else if name === 'backup'}
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M4 17v3h16v-3" />
  {:else}
    <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
    <circle cx="15" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  {/if}
</svg>

<style>
  .nav-icon {
    flex-shrink: 0;
  }
</style>
