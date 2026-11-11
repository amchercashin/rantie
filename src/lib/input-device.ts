/**
 * Is the main pointer a finger (phone, tablet)? There a focused text field pops up the on-screen
 * keyboard over half the screen, so the app never focuses a field on its own: a sheet opens to be
 * read first, and the keyboard comes when the user taps the field. With a mouse (`pointer: fine`,
 * touchscreen laptops included) fields are still focused right away.
 * Evaluated on every call — the primary pointer can change (an iPad gets a trackpad).
 */
export function isTouchPrimary(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
}
