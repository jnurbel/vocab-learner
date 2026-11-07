import type { Rng } from '../srs/random';

/** A copy of `items` in a random order drawn from `rng` (Fisher-Yates). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other] as T, shuffled[index] as T];
  }
  return shuffled;
}
