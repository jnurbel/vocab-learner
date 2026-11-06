import { z } from 'zod';

/** Control characters and bidi overrides or isolates ("trojan source"). */
export const INVISIBLE_CONTROLS = /[\p{Cc}\p{Bidi_Control}]/u;
/** Tolerated in multiline texts only. */
const LINE_BREAKS = /[\t\n\r]/g;

/** A trimmed, non-empty, bounded text from an untrusted file, without invisible controls. */
export const safeText = (maxLength: number, { multiline }: { multiline: boolean }) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine(
      (text) => !INVISIBLE_CONTROLS.test(multiline ? text.replace(LINE_BREAKS, '') : text),
      'Control characters are not allowed',
    );

export const singleLine = (maxLength: number) => safeText(maxLength, { multiline: false });

/** Identifiers end up in IndexedDB keys and DOM attributes: short, plain tokens only. */
export const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** Used in a style directive: a strict hex code leaves no room for CSS injection. */
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
