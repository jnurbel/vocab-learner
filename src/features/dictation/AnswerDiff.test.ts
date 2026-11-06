import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { DiffPart } from '../../domain/dictation/characterDiff';
import AnswerDiff from './AnswerDiff.svelte';

const diff: DiffPart[] = [
  { kind: 'correct', given: '你', expected: '你' },
  { kind: 'wrong', given: '们', expected: '好' },
  { kind: 'missing', expected: '吗' },
  { kind: 'extra', given: '<b>' },
];

describe('AnswerDiff', () => {
  it('marks each character with a shape and a text, never with colour alone', () => {
    render(AnswerDiff, { diff, language: 'zh' });

    const list = screen.getByRole('list', { name: 'Comparaison caractère par caractère' });
    expect(list).toHaveAttribute('lang', 'zh-CN');
    const items = screen.getAllByRole('listitem');
    expect(
      items.map((item) => item.className.split(' ').find((name) => name.startsWith('diff-'))),
    ).toEqual(['diff-correct', 'diff-wrong', 'diff-missing', 'diff-extra']);
    expect(items[0]).toHaveAccessibleName('你, juste');
    expect(items[1]).toHaveAccessibleName('们, faux, attendu 好');
    expect(items[2]).toHaveAccessibleName('吗, manquant');
    expect(items[3]).toHaveAccessibleName('<b>, en trop');
  });

  it('shows markup typed by the learner as plain text', () => {
    const { container } = render(AnswerDiff, { diff, language: 'zh' });

    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<b>')).toBeVisible();
  });

  it('labels an English comparison by letters', () => {
    render(AnswerDiff, { diff: [{ kind: 'correct', given: 'a', expected: 'a' }], language: 'en' });

    expect(screen.getByRole('list', { name: 'Comparaison lettre par lettre' })).toHaveAttribute(
      'lang',
      'en',
    );
  });
});
