import type { ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSwipeToDismiss } from './use-swipe-to-dismiss';

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Visually hide the description (still announced by screen readers). */
  hideDescription?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Mobile bottom sheet built on the Radix dialog primitive:
 * focus trap, escape-to-close, scroll lock, safe-area padding,
 * and swipe down to close (the grabber at the top promises it).
 */
export function BottomSheet({ open, onOpenChange, title, description, hideDescription, children, footer, className }: BottomSheetProps) {
  const { sheetRef, overlayRef } = useSwipeToDismiss(() => onOpenChange(false));
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay ref={overlayRef} className="hi-sheet-overlay fixed inset-0 z-50 bg-[var(--hi-overlay)] backdrop-blur-[2px]" />
        <Dialog.Content
          ref={sheetRef}
          className={cn(
            'hi-sheet fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-x-hidden [overflow-wrap:anywhere]',
            'rounded-t-[28px] border-t border-[var(--hi-line-strong)] bg-[var(--hi-raised)] text-[var(--hi-text)]',
            'shadow-[0_-24px_60px_-20px_rgba(0,0,0,0.9)] outline-none',
            className,
          )}
        >
          <div className="flex justify-center pt-2.5 pb-1" aria-hidden="true">
            <div className="h-1 w-10 rounded-full bg-[var(--hi-line-strong)]" />
          </div>
          <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-3">
            <div className="min-w-0">
              <Dialog.Title className="font-serif text-[26px] leading-tight text-[var(--hi-text)]">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description
                  className={cn(
                    'mt-1 text-[length:var(--hi-text-caption)] leading-snug text-[var(--hi-text-3)]',
                    hideDescription && 'sr-only',
                  )}
                >
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === 'string' ? title : ''}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="hi-pressable -mr-2 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--hi-text-3)] active:bg-[var(--hi-surface)]"
              aria-label="Закрыть"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
          {footer && (
            <div className="border-t border-[var(--hi-line)] px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">{footer}</div>
          )}
          {!footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
