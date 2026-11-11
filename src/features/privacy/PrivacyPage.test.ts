import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import fr from '../../i18n/fr.json';
import PrivacyPage from './PrivacyPage.svelte';

function renderPage() {
  render(PrivacyPage, { version: '0.8.0', site: 'jnurbel.github.io' });
  return screen.getByRole('region', { name: fr.privacy.title });
}

function section(name: string) {
  return screen.getByRole('region', { name });
}

describe('PrivacyPage', () => {
  it('has a part for each question a family asks, in order', () => {
    const page = renderPage();

    expect(
      within(page)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      'Ce qui est enregistré, et où',
      'Ce qui n’est jamais envoyé',
      'La voix',
      'La sauvegarde',
      'Les fonctions en ligne à venir',
      'Comment tout effacer',
      'Licence et contact',
    ]);
  });

  it('says that everything stays on the device and that nothing is sent', () => {
    renderPage();

    expect(section('Ce qui est enregistré, et où')).toHaveTextContent(
      'Tout reste sur cet appareil',
    );
    const notSent = section('Ce qui n’est jamais envoyé');
    expect(notSent).toHaveTextContent('Pas de compte');
    expect(notSent).toHaveTextContent('pas de publicité');
  });

  it('names Google and Microsoft for the online voices', () => {
    renderPage();

    expect(section('La voix')).toHaveTextContent('envoyé à Google ou à Microsoft');
  });

  it('announces the optional photo reading by Claude, with the consent of a parent under 15', () => {
    renderPage();

    const future = section('Les fonctions en ligne à venir');
    expect(future).toHaveTextContent('Claude');
    expect(future).toHaveTextContent('Avant 15 ans, elle demandera l’accord d’un parent.');
  });

  it('tells how to erase everything, on the site the app is served from', () => {
    renderPage();

    const erase = section('Comment tout effacer');
    expect(erase).toHaveTextContent('Données des sites web › jnurbel.github.io › Supprimer');
    expect(erase).toHaveTextContent('fais d’abord une sauvegarde');
  });

  it('gives the license and a way to reach the author, and the version described', () => {
    const page = renderPage();

    expect(section('Licence et contact')).toHaveTextContent('PolyForm Noncommercial 1.0.0');
    expect(within(page).getByRole('link', { name: fr.privacy.contactLink })).toHaveAttribute(
      'href',
      'https://github.com/jnurbel/vocab-learner/issues',
    );
    expect(page).toHaveTextContent('Page valable pour la version 0.8.0.');
  });
});
