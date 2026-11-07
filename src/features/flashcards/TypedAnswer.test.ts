import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { PinyinGenerator } from '../../domain/pinyinGeneration';
import { card } from './flashcards.fixtures';
import type { TypedExercise } from './flashcardSession';
import TypedAnswer from './TypedAnswer.svelte';

const PINYIN: Readonly<Record<string, string>> = { 在: 'zài', 再: 'zài', 见: 'jiàn' };
const fakePinyin: PinyinGenerator = (hanzi) =>
  Array.from(hanzi, (char) => PINYIN[char] ?? char).join(' ');

const ACCEPT = "J'avais bon";

const student = card('student', undefined, {
  term: '学生',
  pinyin: 'xué shēng',
  translation: 'élève, écolier (enfant)',
});
const goodbye = card('goodbye', undefined, {
  term: '再见',
  pinyin: 'zài jiàn',
  translation: 'au revoir',
});
const apple = card('apple', undefined, { language: 'en', term: 'apple', translation: 'pomme' });

function show(
  exercise: TypedExercise,
  shown: Card = student,
  overrides: Partial<{ onAnswer: () => Promise<void>; canReplay: boolean }> = {},
) {
  const props = {
    card: shown,
    exercise,
    canReplay: true,
    onReplay: vi.fn(),
    loadPinyin: () => Promise.resolve(fakePinyin),
    onAnswer: vi.fn(() => Promise.resolve()),
    onAccept: vi.fn(() => Promise.resolve()),
    onContinue: vi.fn(),
    ...overrides,
  };
  render(TypedAnswer, props);
  return { ...props, user: userEvent.setup(), field: screen.getByLabelText('Ta réponse') };
}

const feedback = () => screen.getByTestId('typed-feedback');

describe('typing the meaning of a flashcard', () => {
  it('shows the word alone, without pinyin nor meaning, and focuses a French answer field', () => {
    const { field } = show('typeMeaning');

    expect(screen.getByText('学生')).toHaveAttribute('lang', 'zh-CN');
    expect(screen.queryByText('élève, écolier (enfant)')).toBeNull();
    expect(screen.queryByText('xué')).toBeNull();
    expect(field).toHaveAttribute('lang', 'fr');
    expect(field).toHaveFocus();
    expect(screen.getByText('Écris le sens en français.')).toBeInTheDocument();
  });

  it('accepts one of the senses typed with other accents, and shows the full answer', async () => {
    const { user, field, onAnswer, onReplay } = show('typeMeaning');

    await user.type(field, 'Ecolier{Enter}');

    expect(onAnswer).toHaveBeenCalledWith('correct', { hintsUsed: 0, answer: 'Ecolier' });
    expect(feedback()).toHaveTextContent('✓');
    expect(feedback()).toHaveTextContent('Juste.');
    expect(feedback()).toHaveTextContent('Sens reconnu : écolier');
    expect(feedback()).toHaveTextContent('élève, écolier (enfant)');
    expect(feedback()).toHaveTextContent('学生');
    expect(feedback()).toHaveTextContent('xué');
    expect(feedback().closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
    expect(onReplay).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Continuer' })).toHaveFocus();
  });

  it('says "almost" for a typo, and lets the learner accept it', async () => {
    const home = card('home', undefined, { translation: 'maison' });
    const { user, field, onAnswer } = show('typeMeaning', home);

    await user.type(field, 'maisonn{Enter}');

    expect(onAnswer).toHaveBeenCalledWith('almost', { hintsUsed: 0, answer: 'maisonn' });
    expect(feedback()).toHaveTextContent('Presque : maison.');
    expect(screen.getByRole('button', { name: ACCEPT })).toBeInTheDocument();
  });

  it('accepts a wrong meaning as right with the button "J\'avais bon", once', async () => {
    const { user, field, onAnswer, onAccept } = show('typeMeaning');
    await user.type(field, 'pupille{Enter}');
    expect(onAnswer).toHaveBeenCalledWith('wrong', { hintsUsed: 0, answer: 'pupille' });
    expect(feedback()).toHaveTextContent('✗');

    await user.click(screen.getByRole('button', { name: ACCEPT }));

    expect(onAccept).toHaveBeenCalledOnce();
    expect(feedback()).toHaveTextContent('✓');
    expect(feedback()).toHaveTextContent('Compté juste.');
    expect(screen.queryByRole('button', { name: ACCEPT })).toBeNull();
  });

  it('offers no way to accept "Je ne sais pas", which is wrong without an answer', async () => {
    const { user, onAnswer } = show('typeMeaning');

    await user.click(screen.getByRole('button', { name: 'Je ne sais pas' }));

    expect(onAnswer).toHaveBeenCalledWith('wrong', { hintsUsed: 0 });
    expect(feedback()).toHaveTextContent('Faux. La réponse était élève, écolier (enfant).');
    expect(screen.queryByRole('button', { name: ACCEPT })).toBeNull();
  });

  it('ignores an empty answer', async () => {
    const { user, field, onAnswer } = show('typeMeaning');

    await user.type(field, '   {Enter}');

    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('shows a hostile answer as plain text', async () => {
    const { user, field } = show('typeMeaning');

    await user.type(field, '<img src=x onerror=alert(1)>{Enter}');

    expect(feedback()).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('keeps the answer when it could not be saved, so that it can be sent again', async () => {
    const onAnswer = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue();
    const { user, field } = show('typeMeaning', student, { onAnswer });

    await user.type(field, 'élève{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent("La réponse n'a pas pu être enregistrée");
    expect(field).toHaveValue('élève');

    await user.type(field, '{Enter}');
    expect(feedback()).toHaveTextContent('Juste.');
  });

  it('replays the word on request', async () => {
    const { user, onReplay } = show('typeMeaning');

    await user.click(screen.getByRole('button', { name: 'Réécouter' }));

    expect(onReplay).toHaveBeenCalledOnce();
  });

  it('offers no replay without a voice', () => {
    show('typeMeaning', student, { canReplay: false });

    expect(screen.queryByRole('button', { name: 'Réécouter' })).toBeNull();
  });

  it('continues to the next card', async () => {
    const { user, field, onContinue } = show('typeMeaning');
    await user.type(field, 'élève{Enter}');

    await user.click(screen.getByRole('button', { name: 'Continuer' }));

    expect(onContinue).toHaveBeenCalledOnce();
  });
});

describe('typing the word of a flashcard', () => {
  it('shows the meaning, and takes hanzi in a Chinese field, without playing the word first', () => {
    const { field } = show('typeWord', goodbye);

    expect(screen.getByText('au revoir')).toHaveAttribute('lang', 'fr');
    expect(screen.queryByText('再见')).toBeNull();
    expect(field).toHaveAttribute('lang', 'zh-CN');
    expect(screen.queryByRole('button', { name: 'Réécouter' })).toBeNull();
    expect(screen.getByText('Écris le caractère chinois.')).toBeInTheDocument();
  });

  it('never validates on the Enter that confirms a composition', async () => {
    const { field, onAnswer } = show('typeWord', goodbye);

    await fireEvent.compositionStart(field);
    await fireEvent.input(field, { target: { value: '再见' } });
    await fireEvent.keyDown(field, { key: 'Enter' });
    await fireEvent.compositionEnd(field);
    await fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    await fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 });
    expect(onAnswer).not.toHaveBeenCalled();

    await fireEvent.keyDown(field, { key: 'Enter' });
    await vi.waitFor(() => {
      expect(onAnswer).toHaveBeenCalledWith('correct', { hintsUsed: 0, answer: '再见' });
    });
  });

  it('refuses the same sound written with other characters, with the diff and no way to accept it', async () => {
    const { user, field, onAnswer } = show('typeWord', goodbye);

    await user.type(field, '在见{Enter}');

    expect(onAnswer).toHaveBeenCalledWith('wrong', { hintsUsed: 0, answer: '在见' });
    expect(feedback()).toHaveTextContent('Bon son, mauvais caractère : 在见 au lieu de 再见.');
    expect(
      screen.getByRole('list', { name: 'Comparaison caractère par caractère' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ACCEPT })).toBeNull();
    expect(screen.getByRole('button', { name: 'Réécouter' })).toBeInTheDocument();
  });

  it('shows the pinyin as a hint, a right answer then counting with the hint', async () => {
    const { user, field, onAnswer } = show('typeWord', goodbye);

    await user.click(screen.getByRole('button', { name: 'Indice' }));
    expect(screen.getByText('zài')).toBeInTheDocument();
    await user.type(field, '再见{Enter}');

    expect(onAnswer).toHaveBeenCalledWith('correctWithHint', { hintsUsed: 1, answer: '再见' });
  });

  it('gives the first letter and the length of an English word as a hint', async () => {
    const { user, field } = show('typeWord', apple);
    expect(field).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Écris le mot anglais.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Indice' }));

    expect(screen.getByText('Commence par « a », 5 lettres.')).toBeInTheDocument();
  });
});
