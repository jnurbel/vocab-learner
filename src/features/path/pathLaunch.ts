import type { PathStep } from '../../domain/progressRecords';

/** Why a step's exercise is opened from the path. */
export type LaunchPurpose = 'stepSession' | 'placementTest';

/** Steps played on the app's existing screens. */
export type BuiltInStep = Extract<PathStep, 'discover' | 'listen' | 'type' | 'dictation'>;

/** Steps whose exercises (bridgeMatch, toneEcho, sentenceListen, sentenceShuffle) live elsewhere. */
export type ExerciseStep = Extract<PathStep, 'recognize' | 'sentences'>;
