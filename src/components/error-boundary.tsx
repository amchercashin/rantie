import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string;
  resetting: boolean;
  copied: boolean;
}

/** A lazy page chunk that is gone after a deploy (old shell, new server) — fixed by fetching the app again. */
export function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk/i.test(text);
}

const CHUNK_RELOAD_KEY = 'rt-chunk-reload-at';

/**
 * Drop the service worker and its caches, then load the app from the network.
 * IndexedDB (the portfolio) and localStorage are left untouched.
 */
export async function resetAppCache(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch { /* ignore */ }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }
}

function describe(error: Error, componentStack: string): string {
  const firstComponents = componentStack
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join('\n');
  return [
    `${error.name}: ${error.message}`,
    firstComponents,
    `${navigator.userAgent}`,
    `${location.href} · ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '', resetting: false, copied: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? '' });

    // A missing chunk after a deploy: fetch the app again once, without bothering the user.
    if (isChunkLoadError(error)) {
      try {
        const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || '0');
        if (Date.now() - last > 60_000) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
          void resetAppCache().then(() => window.location.reload());
        }
      } catch { /* ignore */ }
    }
  }

  private reset = async () => {
    this.setState({ resetting: true });
    await resetAppCache();
    window.location.reload();
  };

  private copy = async () => {
    if (!this.state.error) return;
    try {
      await navigator.clipboard.writeText(describe(this.state.error, this.state.componentStack));
      this.setState({ copied: true });
    } catch { /* ignore */ }
  };

  render() {
    const { error, componentStack, resetting, copied } = this.state;
    if (error) {
      return (
        <div className="flex min-h-[100vh] min-h-[100dvh] items-center justify-center bg-[var(--hi-void)] p-6">
          <div className="w-full max-w-[340px] text-center">
            <div className="font-serif text-[32px] leading-tight text-[var(--hi-text)]">Что-то пошло не так</div>
            <p className="mt-2 text-[length:var(--hi-text-body)] leading-relaxed text-[var(--hi-text-2)]">
              Портфель хранится на устройстве, сброс кеша его не трогает. Обычно помогает загрузить приложение заново.
            </p>
            <button
              type="button"
              disabled={resetting}
              onClick={this.reset}
              className="mt-6 min-h-12 w-full rounded-2xl py-3 bg-[var(--hi-gold)] px-6 text-[length:var(--hi-text-body)] font-semibold text-[#1a1509] disabled:opacity-60"
            >
              {resetting ? 'Загружаем…' : 'Сбросить кеш и перезагрузить'}
            </button>

            <details className="mt-6 text-left">
              <summary className="cursor-pointer text-center text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
                Подробности для разработчика
              </summary>
              <pre
                data-testid="error-details"
                className="mt-3 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--hi-line)] bg-[var(--hi-surface)] p-3 text-left font-mono text-[11px] leading-snug text-[var(--hi-text-2)]"
              >
                {describe(error, componentStack)}
              </pre>
              <button
                type="button"
                onClick={this.copy}
                className="mt-2 w-full rounded-xl border border-[var(--hi-line-strong)] py-2 text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-text-2)]"
              >
                {copied ? 'Скопировано' : 'Скопировать текст ошибки'}
              </button>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
