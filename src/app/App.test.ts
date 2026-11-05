import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import fr from '../i18n/fr.json';
import App from './App.svelte';

describe('App', () => {
  it('renders the application title from the French strings', () => {
    render(App);

    expect(screen.getByRole('heading', { level: 1, name: fr.app.title })).toBeInTheDocument();
  });
});
