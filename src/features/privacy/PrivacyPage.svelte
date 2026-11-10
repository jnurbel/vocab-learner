<script lang="ts">
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';

  interface Props {
    /** The version of the app this page describes. */
    version: string;
    /** The site whose data the browser erases, e.g. jnurbel.github.io. */
    site: string;
  }

  const { version, site }: Props = $props();

  /** Where to reach the author (NOTICE): an issue on the project. */
  const CONTACT_URL = 'https://github.com/jnurbel/vocab-learner/issues';

  const sections = Object.entries(fr.privacy.sections);
</script>

<section aria-labelledby="privacy-title" class="privacy">
  <h2 id="privacy-title">{fr.privacy.title}</h2>
  <p class="intro">{fr.privacy.intro}</p>

  {#each sections as [key, { title, paragraphs }] (key)}
    <section aria-labelledby={`privacy-${key}`}>
      <h3 id={`privacy-${key}`}>{title}</h3>
      {#each paragraphs as paragraph, index (index)}
        <p>{format(paragraph, { site })}</p>
      {/each}
    </section>
  {/each}

  <p>
    {fr.privacy.contact}
    <a href={CONTACT_URL} rel="noopener noreferrer">{fr.privacy.contactLink}</a>
  </p>
  <p class="help">{format(fr.privacy.version, { version })}</p>
</section>

<style>
  .privacy {
    line-height: 1.55;
  }

  .intro {
    font-size: var(--text-md);
    font-weight: var(--weight-bold);
  }

  h3 {
    margin: var(--space-5) 0 var(--space-2);
    font-size: var(--text-md);
    font-weight: var(--weight-heavy);
  }

  p {
    max-width: 70ch;
    margin: 0 0 var(--space-2);
  }

  a {
    color: var(--jade-strong);
    font-weight: var(--weight-bold);
    overflow-wrap: anywhere;
  }
</style>
