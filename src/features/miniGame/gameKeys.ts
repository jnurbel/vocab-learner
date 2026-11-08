/**
 * True when a key belongs to the element it was pressed on: typing in a field, or Space and
 * Enter on a button, which the browser turns into a click. The game ignores those keys.
 */
export function isOwnKeyTarget(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.closest('input, textarea, select, [contenteditable="true"]') !== null) {
    return true;
  }
  return (key === ' ' || key === 'Enter') && target.closest('button, a, summary') !== null;
}

/** A key pressed with Ctrl, Cmd or Alt is a browser shortcut, never a game key. */
export function isShortcut(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}
