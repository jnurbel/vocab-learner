import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Language } from '../../domain/card';
import { EXAM_CONFIG } from '../../domain/exam/examConfig';
import { card, focusLabel, reviewed, words } from '../../domain/exam/exam.fixtures';
import type { Label } from '../../domain/label';
import { GAME_CONFIG } from '../../domain/srs/config';
import { createFsrsMemoryModel } from '../../domain/srs/fsrsMemoryModel';
import fr from '../../i18n/fr.json';
import { FakeSpeaker } from '../dictation/dictation.fixtures';
import Home from './Home.svelte';
import { buildHomeView, type HomeView, type HomeViewInput } from './homeView';

const srs = {
  model: createFsrsMemoryModel(GAME_CONFIG.fsrs),
  config: GAME_CONFIG,
  timeZone: 'Europe/Paris',
};
const today = '2026-11-06';

function viewOf(overrides: Partial<HomeViewInput>): HomeView {
  return buildHomeView(
    {
      cards: [],
      labels: [],
      states: [],
      today,
      language: 'zh',
      newPerDay: 5,
      newIntroducedToday: 0,
      ...overrides,
    },
    { srs, exam: EXAM_CONFIG },
  );
}

const lesson = (examDate?: string) => focusLabel('lesson', examDate, { name: 'Leçon 7' });

function setup(views: Partial<Record<Language, HomeView>>) {
  const props = {
    language: 'zh' as Language,
    loadView: vi.fn((language: Language) => Promise.resolve(views[language] ?? viewOf({}))),
    speaker: new FakeSpeaker(true, true),
    onStart: vi.fn(),
    onPractice: vi.fn(),
    onAddWords: vi.fn(),
    onUndoUnpin: vi.fn<(label: Label) => Promise<void>>(() => Promise.resolve()),
    onIntensiveChange: vi.fn<(label: Label, intensive: boolean) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    onOpenPath: vi.fn(),
  };
  render(Home, props);
  return { ...props, user: userEvent.setup() };
}

async function focusCard(name = 'Leçon 7') {
  return screen.findByRole('region', { name });
}

describe('Home', () => {
  it('shows a card per pinned label: words, countdown, gauge and plan status', async () => {
    setup({ zh: viewOf({ cards: words('lesson', 25), labels: [lesson('2026-11-13')] }) });

    const region = await focusCard();
    expect(within(region).getByText('25 mots')).toBeVisible();
    expect(within(region).getByText('Contrôle dans 7 jours · ven. 13 nov.')).toBeVisible();
    expect(
      within(region).getByRole('img', { name: '0 mot maîtrisé sur 25, soit 0 %' }),
    ).toBeVisible();
    expect(within(region).getByText(/^Au rythme prévu/)).toBeVisible();
    expect(within(region).getByText('5 nouveaux mots')).toBeVisible();
  });

  it('says that a label is ready for its test once its final challenge is passed', async () => {
    setup({
      zh: viewOf({ cards: words('lesson', 5), labels: [lesson()], readyLabelIds: ['lesson'] }),
    });

    expect(within(await focusCard()).getByText(fr.home.readyForExam)).toBeVisible();
  });

  it('opens the path of a pinned label in the language shown', async () => {
    const { onOpenPath, user } = setup({
      zh: viewOf({ cards: words('lesson', 25), labels: [lesson('2026-11-13')] }),
    });

    await user.click(
      within(await focusCard()).getByRole('button', { name: 'Voir le parcours de Leçon 7' }),
    );

    expect(onOpenPath).toHaveBeenCalledWith(expect.objectContaining({ id: 'lesson' }), 'zh');
  });

  it('starts today’s session of the language with its estimated length', async () => {
    const { onStart, user } = setup({
      zh: viewOf({ cards: words('lesson', 25), labels: [lesson('2026-11-13')] }),
    });

    await user.click(await screen.findByRole('button', { name: 'Commencer la session · ~3 min' }));

    expect(onStart).toHaveBeenCalledWith('zh');
  });

  it('switches to the English tab, also with the arrow keys', async () => {
    const english = viewOf({
      cards: [card('cat', ['lesson'], { language: 'en' })],
      labels: [lesson()],
      language: 'en',
    });
    const { loadView, user } = setup({ zh: viewOf({}), en: english });
    const tabs = screen.getByRole('tablist', { name: fr.home.languageTabs });
    const chinese = within(tabs).getByRole('tab', { name: /Chinois/ });
    expect(chinese).toHaveAttribute('aria-selected', 'true');

    chinese.focus();
    await user.keyboard('{ArrowRight}');

    const englishTab = within(tabs).getByRole('tab', { name: 'Anglais' });
    expect(englishTab).toHaveAttribute('aria-selected', 'true');
    expect(englishTab).toHaveFocus();
    expect(loadView).toHaveBeenLastCalledWith('en');
    expect(await focusCard()).toHaveTextContent('1 mot');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Anglais');
  });

  it('offers free practice when nothing is thirsty', async () => {
    const cards = words('lesson', 2);
    const states = cards.map(({ id }) => reviewed(id, '2026-11-20T08:00:00Z'));
    const { onPractice, user } = setup({ zh: viewOf({ cards, states, labels: [lesson()] }) });

    expect(await screen.findByText(fr.home.nothingDue)).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.home.freePractice }));

    expect(onPractice).toHaveBeenCalledWith('zh', []);
  });

  it('invites to add the first words, with the session button disabled', async () => {
    const { onAddWords, user } = setup({ zh: viewOf({}) });

    expect(await screen.findByRole('heading', { name: fr.home.noCards })).toBeVisible();
    expect(screen.getByRole('button', { name: fr.home.startNothing })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: fr.home.addWords }));

    expect(onAddWords).toHaveBeenCalled();
  });

  it('offers the three choices of an overloaded plan', async () => {
    const { onIntensiveChange, onPractice, user } = setup({
      zh: viewOf({ cards: words('lesson', 500), labels: [lesson('2026-11-13')] }),
    });

    const region = await focusCard();
    expect(
      within(region).getByText(
        '500 mots nouveaux en 7 jours, c’est trop pour tout voir sérieusement. À 20 mots par jour, tu en découvriras 140 sur 500.',
      ),
    ).toBeVisible();
    const choices = within(region).getByRole('group', { name: fr.home.overload.legend });
    expect(within(choices).getByRole('button', { name: fr.home.overload.normal })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(choices).getByRole('button', { name: fr.home.overload.intensive }));
    await user.click(within(choices).getByRole('button', { name: fr.home.overload.skim }));

    expect(onIntensiveChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'lesson' }), true);
    expect(onPractice).toHaveBeenCalledWith('zh', ['lesson']);
  });

  it('goes back to the normal pace from the intensive mode', async () => {
    const { onIntensiveChange, user } = setup({
      zh: viewOf({
        cards: words('lesson', 500),
        labels: [lesson('2026-11-13')],
        settings: { intensiveExamMode: { lesson: true } },
      }),
    });
    const region = await focusCard();

    await user.click(within(region).getByRole('button', { name: fr.home.overload.normal }));

    expect(onIntensiveChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'lesson' }),
      false,
    );
  });

  it('says that the test is tomorrow and aims at recognising the words', async () => {
    setup({ zh: viewOf({ cards: words('lesson', 5), labels: [lesson('2026-11-07')] }) });

    const region = await focusCard();
    expect(within(region).getByText('Contrôle demain · sam. 7 nov.')).toBeVisible();
    expect(within(region).getByText(fr.home.status.shortNotice)).toBeVisible();
  });

  it('offers a warm-up on the day of the test', async () => {
    const { onPractice, user } = setup({
      zh: viewOf({ cards: words('lesson', 5), labels: [lesson(today)] }),
    });

    const region = await focusCard();
    expect(within(region).getByText(fr.home.status.examDay)).toBeVisible();
    await user.click(within(region).getByRole('button', { name: fr.home.warmUp }));

    expect(onPractice).toHaveBeenCalledWith('zh', ['lesson']);
  });

  it('announces a label unpinned after its test, and undoes it', async () => {
    const unpinned = focusLabel('old', undefined, {
      name: 'Leçon 6',
      isFocus: false,
      pastExamDate: '2026-11-05',
      unfocusedOn: today,
    });
    const { onUndoUnpin, loadView, user } = setup({
      zh: viewOf({ cards: words('old', 2), labels: [unpinned] }),
    });

    const banner = await screen.findByRole('region', { name: fr.home.unpinnedTitle });
    expect(banner).toHaveTextContent(
      '« Leçon 6 » : contrôle passé (jeu. 5 nov.), label désépinglé.',
    );
    await user.click(
      within(banner).getByRole('button', { name: 'Annuler le désépinglage de Leçon 6' }),
    );

    expect(onUndoUnpin).toHaveBeenCalledWith(unpinned);
    expect(loadView).toHaveBeenCalledTimes(2);
  });

  it('lists the other labels with their gauge and thirst', async () => {
    const labels = [focusLabel('animals', undefined, { name: 'Animaux', isFocus: false })];
    const cards = words('animals', 3);
    const states = cards.map(({ id }) => reviewed(id, '2026-11-05T08:00:00Z'));
    setup({ zh: viewOf({ cards, states, labels }) });

    const list = await screen.findByRole('region', { name: fr.home.labelsTitle });
    const item = within(list).getByRole('listitem');
    expect(item).toHaveTextContent('Animaux');
    expect(item).toHaveTextContent('3 à arroser');
    expect(within(item).getByRole('meter', { name: 'Animaux : 0/3 mots maîtrisés' })).toBeVisible();
  });

  it('lets the learner listen to the words that resist', async () => {
    const cards = [card('预报', [])];
    const states = [reviewed('预报', '2026-11-20T08:00:00Z', { lapses: 3 })];
    const { speaker, user } = setup({ zh: viewOf({ cards, states }) });

    const resisting = await screen.findByRole('region', { name: fr.home.resistingTitle });
    await user.click(within(resisting).getByRole('button', { name: 'Écouter 预报' }));

    expect(speaker.readings).toMatchObject([{ text: '预报', language: 'zh' }]);
  });

  it('shows the progress kept by the game, or a neutral zone without it', async () => {
    setup({
      zh: viewOf({
        progress: {
          xp: 640,
          level: 4,
          streakDays: 3,
          bestStreak: 9,
          dailyXp: 80,
          dailyXpDay: today,
        },
      }),
    });

    const zone = await screen.findByRole('region', { name: fr.home.progressTitle });
    expect(zone).toHaveTextContent('80 / 300 XP');
    expect(within(zone).getByRole('meter', { name: fr.home.dailyGoal })).toHaveAttribute(
      'value',
      '80',
    );
    expect(zone).toHaveTextContent('3 jours');
    expect(zone).toHaveTextContent('Niveau 4');
  });

  it('keeps the progress zone neutral until the game stores any', async () => {
    setup({ zh: viewOf({}) });

    const zone = await screen.findByRole('region', { name: fr.home.progressTitle });
    expect(zone).toHaveTextContent(fr.home.progressNeutral);
  });

  it('says so when the home cannot be loaded', async () => {
    const props = {
      language: 'zh' as Language,
      loadView: vi.fn(() => Promise.reject(new Error('broken'))),
      speaker: new FakeSpeaker(),
      onStart: vi.fn(),
      onPractice: vi.fn(),
      onAddWords: vi.fn(),
      onUndoUnpin: vi.fn(() => Promise.resolve()),
      onIntensiveChange: vi.fn(() => Promise.resolve()),
    };
    render(Home, props);

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.home.loadFailed);
  });
});
