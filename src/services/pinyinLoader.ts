import type { PinyinGenerator } from '../domain/pinyinGeneration';
import { lazyLoader } from './lazyLoader';

/** pinyin-pro is large: it is fetched as a separate chunk, only when a pinyin must be proposed. */
export const loadPinyinGenerator: () => Promise<PinyinGenerator> = lazyLoader(async () => {
  const { pinyinProGenerator } = await import('../domain/pinyinProGenerator');
  return pinyinProGenerator;
});
