import type { Difficulty } from './miniGameConfig';

export interface EnglishMinimalPair {
  /** Two words told apart by a single sound, in alphabetical order of their contrast. */
  readonly words: readonly [string, string];
  /** 1: clear contrasts; 3: the sounds French speakers merge (/ɪ/–/iː/, /θ/–/s/, silent /h/...). */
  readonly level: Difficulty;
}

const pair = (first: string, second: string, level: Difficulty): EnglishMinimalPair =>
  Object.freeze({ words: Object.freeze([first, second] as const), level });

/**
 * English minimal pairs for ToneEcho (GAME_DESIGN.md 6.3), written for this app from common
 * words: no external list, so no licence to check (GAME_DESIGN.md 12, point 16). Each word
 * appears once, and no pair holds homophones.
 */
export const ENGLISH_MINIMAL_PAIRS: readonly EnglishMinimalPair[] = Object.freeze([
  // Level 1: consonants far apart.
  pair('fan', 'van', 1),
  pair('pig', 'big', 1),
  pair('coat', 'goat', 1),
  pair('light', 'right', 1),
  pair('bear', 'pear', 1),
  pair('bed', 'red', 1),
  pair('dog', 'log', 1),
  pair('fine', 'wine', 1),
  // Level 2: close vowels, voiced and voiceless endings.
  pair('cat', 'cut', 2),
  pair('pan', 'pen', 2),
  pair('cap', 'cup', 2),
  pair('bag', 'bug', 2),
  pair('walk', 'work', 2),
  pair('full', 'fool', 2),
  pair('pull', 'pool', 2),
  pair('rack', 'rag', 2),
  // Level 3: the hardest for French speakers.
  pair('ship', 'sheep', 3),
  pair('live', 'leave', 3),
  pair('bit', 'beat', 3),
  pair('fill', 'feel', 3),
  pair('sit', 'seat', 3),
  pair('chip', 'cheap', 3),
  pair('think', 'sink', 3),
  pair('thin', 'sin', 3),
  pair('mouth', 'mouse', 3),
  pair('thick', 'sick', 3),
  pair('heat', 'eat', 3),
  pair('hair', 'air', 3),
  pair('hand', 'and', 3),
  pair('hill', 'ill', 3),
  pair('hold', 'old', 3),
  pair('heart', 'art', 3),
]);
