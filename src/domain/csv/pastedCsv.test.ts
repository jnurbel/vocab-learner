import { describe, expect, it } from 'vitest';
import { csvFromReply } from './pastedCsv';

describe('csvFromReply', () => {
  it('keeps a CSV pasted as it is', () => {
    expect(csvFromReply('terme;pinyin;sens\n猫;māo;chat')).toBe('terme;pinyin;sens\n猫;māo;chat');
  });

  it('takes the CSV out of the code block an AI puts it in, with the words around', () => {
    const reply =
      'Voici le fichier :\n\n```csv\nterme;pinyin;sens\n猫;māo;chat\n```\n\nBonne révision !';

    expect(csvFromReply(reply)).toBe('terme;pinyin;sens\n猫;māo;chat');
  });

  it('reads a code block without a language, or one left open', () => {
    expect(csvFromReply('```\n猫;māo;chat\n```')).toBe('猫;māo;chat');
    expect(csvFromReply('```csv\n猫;māo;chat')).toBe('猫;māo;chat');
  });

  it('trims the blank lines around the CSV', () => {
    expect(csvFromReply('\n\n  猫;māo;chat  \n\n')).toBe('猫;māo;chat');
  });
});
