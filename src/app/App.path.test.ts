import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Card } from '../domain/card';
import type { PathProgressRecord } from '../domain/progressRecords';
import fr from '../i18n/fr.json';
import { FakeSpeaker } from '../features/dictation/dictation.fixtures';
import { VocabularyDatabase } from '../storage/database';
import { VocabularyRepository } from '../storage/vocabularyRepository';
import App from './App.svelte';

const created = '2026-11-01T08:00:00.000Z';

function word(id: string, term: string, translation: string): Card {
  return {
    id,
    language: 'zh',
    term,
    translation,
    labelIds: ['lesson'],
    source: 'manual',
    createdAt: created,
    updatedAt: created,
  };
}

async function seedPinnedLesson(databaseName: string, path?: PathProgressRecord) {
  const repository = new VocabularyRepository(databaseName);
  await repository.saveLabel({
    id: 'lesson',
    name: 'Leçon 7',
    isFocus: true,
    createdAt: created,
    updatedAt: created,
  });
  await repository.saveImport({
    cardsToCreate: [word('cat', '猫', 'chat'), word('dog', '狗', 'chien')],
    cardsToUpdate: [],
  });
  if (path !== undefined) {
    const db = new VocabularyDatabase(databaseName);
    await db.pathProgress.put(path);
    db.close();
  }
}

const now = () => new Date('2026-11-07T10:00:00+01:00');

async function openPath(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Voir le parcours de Leçon 7' }));
  return screen.findByRole('list', { name: fr.path.stepsLabel });
}

describe('App and the label path', () => {
  it('validates the first step with flashcards, then shows the second one as current', async () => {
    const databaseName = 'app-test-path-discover';
    await seedPinnedLesson(databaseName);
    const user = userEvent.setup();
    render(App, { databaseName, now, speaker: new FakeSpeaker(true, true) });

    await openPath(user);
    await user.click(screen.getByRole('button', { name: fr.path.continue }));
    const flashcards = await screen.findByRole('region', { name: fr.flashcards.title });
    for (let answered = 0; answered < 2; answered += 1) {
      await user.click(await within(flashcards).findByRole('button', { name: fr.flashcards.flip }));
      await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.good }));
    }
    await screen.findByRole('heading', { name: fr.flashcards.summaryTitle });
    await user.click(screen.getByRole('button', { name: fr.path.back }));

    expect(await screen.findByText('Étape validée : Découvrir. +50 XP.')).toBeVisible();
    const steps = within(screen.getByRole('list', { name: fr.path.stepsLabel })).getAllByRole(
      'listitem',
    );
    expect(steps[1]).toHaveTextContent('À faire');
  });

  it('offers the recognize games on the words of the step, and opens BridgeMatch on them', async () => {
    const databaseName = 'app-test-path-recognize';
    await seedPinnedLesson(databaseName, {
      labelId: 'lesson',
      language: 'zh',
      steps: { discover: 'validated', listen: 'validated' },
    });
    const user = userEvent.setup();
    render(App, { databaseName, now, speaker: new FakeSpeaker(true, true) });

    await openPath(user);
    await user.click(screen.getByRole('button', { name: fr.path.continue }));

    const games = await screen.findByRole('region', { name: fr.path.chooseGame });
    expect(
      within(games).getByRole('button', { name: fr.miniGames.games.toneEcho.name }),
    ).toBeVisible();
    await user.click(
      within(games).getByRole('button', { name: fr.miniGames.games.bridgeMatch.name }),
    );

    expect((await screen.findAllByRole('button', { name: fr.path.back })).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole('region', { name: fr.path.chooseGame })).toBeNull();
  });

  it('opens the path of a pinned label from the labels screen', async () => {
    const databaseName = 'app-test-path-labels';
    await seedPinnedLesson(databaseName);
    const user = userEvent.setup();
    render(App, { databaseName, now, speaker: new FakeSpeaker(true, true) });

    await user.click(screen.getByRole('button', { name: fr.nav.words }));
    await user.click(await screen.findByRole('button', { name: 'Voir le parcours de Leçon 7' }));

    expect(await screen.findByRole('heading', { name: 'Leçon 7', level: 2 })).toBeVisible();
  });

  it('takes the final challenge from the path and shows its score out of 20', async () => {
    const databaseName = 'app-test-path-challenge';
    await seedPinnedLesson(databaseName, {
      labelId: 'lesson',
      language: 'zh',
      steps: {
        discover: 'validated',
        listen: 'validated',
        recognize: 'validated',
        type: 'validated',
        dictation: 'validated',
      },
    });
    const user = userEvent.setup();
    render(App, { databaseName, now, speaker: new FakeSpeaker(true, true) });

    await openPath(user);
    await user.click(screen.getByRole('button', { name: fr.path.finalChallenge }));
    await user.click(await screen.findByRole('button', { name: fr.finalChallenge.start }));
    await user.click(screen.getByRole('button', { name: fr.finalChallenge.dontKnow }));
    await screen.findByText('2/2');
    await user.click(screen.getByRole('button', { name: fr.finalChallenge.dontKnow }));

    expect(
      await screen.findByRole('heading', { name: fr.finalChallenge.resultNotYet }),
    ).toBeVisible();
    expect(screen.getByText('Note : 0 sur 20')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: fr.finalChallenge.backToPath }));
    expect(await screen.findByRole('list', { name: fr.path.stepsLabel })).toBeVisible();
  });
});
