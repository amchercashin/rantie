import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { GUIDE_CONTENT } from '@/components/guide/guide-sections';
import { GUIDE_GROUPS, GUIDE_SECTIONS, guideElementId, sectionFromHash, type GuideSectionId } from '@/lib/guide';

type GuideSection = (typeof GUIDE_SECTIONS)[number];

/** The summary goes above the contents; the rest follows them, group by group. */
const summary = GUIDE_SECTIONS.filter((s) => s.group === 'start');
const details = GUIDE_SECTIONS.filter((s) => s.group !== 'start');
import { restingScrollTop, scrollToWithPeek } from '@/lib/smooth-scroll';
import { cn } from '@/lib/utils';

/** How far below the header a section's title rests after a jump. */
const PEEK = 12;

/**
 * «Как устроен Рантье»: the whole app explained for the curious, one page with sections.
 * Opened from Настройки → Обучение and from the «i» of a hint (`/settings/guide#income`),
 * which lands right on its section.
 */
export function GuidePage() {
  const { hash } = useLocation();
  const [flash, setFlash] = useState<GuideSectionId | null>(null);
  const stopScrollRef = useRef<(() => void) | null>(null);

  // Arriving with #section: be there at once (the page slides in already scrolled) and mark the spot.
  useLayoutEffect(() => {
    const id = sectionFromHash(hash);
    const target = id && document.getElementById(guideElementId(id));
    const scroller = target?.closest('main');
    if (!id || !target || !scroller) return;
    scroller.scrollTop = restingScrollTop(
      {
        scrollTop: scroller.scrollTop,
        scrollerTop: scroller.getBoundingClientRect().top,
        targetTop: target.getBoundingClientRect().top,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
      },
      PEEK,
    );
    setFlash(id);
    const timer = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(timer);
  }, [hash]);

  useEffect(() => () => stopScrollRef.current?.(), []);

  const jumpTo = (id: GuideSectionId) => {
    const target = document.getElementById(guideElementId(id));
    if (!target) return;
    stopScrollRef.current?.();
    stopScrollRef.current = scrollToWithPeek(target, PEEK);
  };

  const renderSection = (s: GuideSection, startsGroup: boolean) => (
    <section
      key={s.id}
      id={guideElementId(s.id)}
      aria-labelledby={`${guideElementId(s.id)}-title`}
      className={cn(
        '-mx-3 rounded-[22px] px-3 pb-2 pt-2',
        startsGroup ? 'mt-3' : 'mt-6',
        flash === s.id && 'animate-[hi-highlight-pulse_1.8s_ease-out_both]',
      )}
    >
      <h2
        id={`${guideElementId(s.id)}-title`}
        className="font-serif text-[clamp(25px,7.4vw,29px)] font-medium leading-[1.1] text-[var(--hi-text)]"
      >
        {s.title}
      </h2>
      <div className="mt-3 space-y-3">{GUIDE_CONTENT[s.id]}</div>
    </section>
  );

  return (
    <AppShell
      back="/settings"
      title="Как устроен Рантье"
      subtitle="Откуда берутся цифры, как считается доход и где хранится портфель"
    >
      {summary.map((s) => renderSection(s, true))}

      <nav aria-label="Содержание" className="mt-8 rounded-[22px] border border-[var(--hi-line)] bg-[var(--hi-surface)] px-4 py-3">
        {GUIDE_GROUPS.filter((g) => g.id !== 'start').map((group) => (
          <div key={group.id} className="py-1.5">
            <div className="hi-eyebrow">{group.title}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {GUIDE_SECTIONS.filter((s) => s.group === group.id).map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    jumpTo(s.id);
                  }}
                  className="hi-pressable rounded-full border border-[var(--hi-line-strong)] px-3 py-1.5 text-[length:var(--hi-text-caption)] font-medium leading-tight text-[var(--hi-text-2)] active:bg-[var(--hi-raised)]"
                >
                  {s.short}
                </a>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {details.map((s, i) => {
        const startsGroup = i === 0 || details[i - 1].group !== s.group;
        const group = GUIDE_GROUPS.find((g) => g.id === s.group)!;
        return (
          <Fragment key={s.id}>
            {startsGroup && (
              <div className="mt-12 flex items-center gap-3 px-1" aria-hidden="true">
                <span className="hi-eyebrow shrink-0 text-[var(--hi-gold-deep)]">{group.title}</span>
                <span className="h-px flex-1 bg-[var(--hi-line)]" />
              </div>
            )}
            {renderSection(s, startsGroup)}
          </Fragment>
        );
      })}
    </AppShell>
  );
}
