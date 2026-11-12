import { RefreshCw } from 'lucide-react';

/**
 * The refresh button's icon inside running text («кнопка ⟳»): the ⟳ character is tiny in Manrope
 * and does not look like the button, the icon does.
 */
export function SyncGlyph() {
  return (
    <RefreshCw
      role="img"
      aria-label="⟳"
      strokeWidth={2.2}
      className="inline-block size-[0.95em] align-[-0.12em] text-[var(--hi-gold)]"
    />
  );
}
