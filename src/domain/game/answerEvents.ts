import type { SettingsRecord } from '../progressRecords';
import type { SrsConfig } from '../srs/config';
import type { ReviewState } from '../srs/reviewState';
import { isAtLeast, stageOf } from '../srs/stage';
import type { AnswerGivenEvent, GameEvent } from './applyEvent';
import type { EconomyConfig } from './economyConfig';

/** An answer, with the review state before and after it when it has one (not free practice). */
export interface AnsweredWord extends Omit<AnswerGivenEvent, 'type'> {
  before?: ReviewState;
  after?: ReviewState;
}

/** The events the game receives for one answer, in order. */
export function answerEvents(
  { before, after, ...answer }: AnsweredWord,
  config: Pick<SrsConfig, 'stageThresholds'>,
): GameEvent[] {
  const { cardId, language } = answer;
  const events: GameEvent[] = [];
  if (before?.reps === 0) {
    events.push({ type: 'CardIntroduced', cardId, language });
  }
  events.push({ type: 'AnswerGiven', ...answer });
  if (before !== undefined && after !== undefined) {
    const fromStage = stageOf(before, config);
    const toStage = stageOf(after, config);
    if (!isAtLeast(fromStage, toStage)) {
      const isNewPeak = !isAtLeast(before.peakStage, after.peakStage);
      events.push({ type: 'StageReached', cardId, language, fromStage, toStage, isNewPeak });
    }
  }
  return events;
}

/** The daily goal chosen in the settings, if it is one of the choices; 300 XP by default. */
export function dailyGoalOf(
  settings: Pick<SettingsRecord, 'dailyGoalXp'> | undefined,
  config: Pick<EconomyConfig, 'dailyGoalXpDefault' | 'dailyGoalXpOptions'>,
): number {
  const chosen = settings?.dailyGoalXp;
  return chosen !== undefined && config.dailyGoalXpOptions.includes(chosen)
    ? chosen
    : config.dailyGoalXpDefault;
}
