/** Draws a number from 0 (included) to 1 (excluded). */
export type Rng = () => number;

/**
 * Seeded pseudo-random generator (GAME_DESIGN.md 0.4): mulberry32 seeded by the FNV-1a hash of
 * `seed`. Used to vary exercises, never to grant a reward. Not suitable for security.
 */
export function createRng(seed: string): Rng {
  let state = fnv1a(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}
