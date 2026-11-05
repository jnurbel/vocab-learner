import { pinyin } from 'pinyin-pro';
import type { PinyinGenerator } from './pinyinGeneration';

/** Offline pinyin generation backed by pinyin-pro (MIT), which reads polyphones in context. */
export const pinyinProGenerator: PinyinGenerator = (hanzi) =>
  pinyin(hanzi, { toneType: 'symbol', nonZh: 'consecutive' });
