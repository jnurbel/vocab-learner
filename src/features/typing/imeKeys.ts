/** Legacy key code of a key the input method handles. */
const IME_KEY_CODE = 229;

/**
 * Whether a key typed in an answer field belongs to the input method (GAME_DESIGN.md 6.0): while
 * it composes, Enter picks a candidate and the arrows move among them. Safari sends that Enter
 * after compositionend, with the legacy key code 229. `composing`: between compositionstart
 * and compositionend.
 */
export function belongsToInputMethod(event: KeyboardEvent, composing: boolean): boolean {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return composing || event.isComposing || event.keyCode === IME_KEY_CODE;
}
