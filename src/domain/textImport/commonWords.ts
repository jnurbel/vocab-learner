import type { Language } from '../card';

/**
 * Very common words, hidden on request from the words of a pasted text. A short list of our own:
 * grammar words a learner meets in every sentence, not a frequency dictionary.
 */
export const COMMON_WORDS: Readonly<Record<Language, ReadonlySet<string>>> = {
  zh: new Set([
    ...['的', '了', '是', '在', '和', '也', '不', '就', '都', '很', '有', '没有', '没'],
    ...['我', '你', '他', '她', '它', '我们', '你们', '他们', '她们', '这', '那', '这个', '那个'],
    ...['一', '个', '吗', '呢', '吧', '啊', '着', '过', '地', '得', '上', '下', '里', '说', '要'],
    ...[
      '会',
      '到',
      '去',
      '来',
      '对',
      '还',
      '又',
      '把',
      '被',
      '给',
      '从',
      '跟',
      '但是',
      '因为',
      '所以',
    ],
  ]),
  en: new Set([
    ...['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from'],
    ...['by', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'am', 'i', 'you', 'he', 'she', 'it'],
    ...['we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their'],
    ...['this', 'that', 'these', 'those', 'do', 'does', 'did', 'not', 'no', 'yes', 'so', 'if'],
    ...['have', 'has', 'had', 'will', 'would', 'can', 'could', 'there', 'here', 'what', 'who'],
  ]),
};
