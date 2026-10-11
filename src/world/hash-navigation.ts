// URL navigation shares the loader with UI navigation. Keep the latest request
// while that loader is busy, including empty and unknown fragments.
export function createHashNavigation<T>(options: {
  resolve: (hash: string) => T | null | undefined;
  busy: () => boolean;
  current: (target: T | null) => boolean;
  navigate: (target: T | null) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  let pending: string | null = null, running = false;
  async function flush() {
    if (running || options.busy()) return;
    running = true;
    try {
      while (pending !== null && !options.busy()) {
        const hash = pending; pending = null;
        const target = options.resolve(hash);
        if (target === undefined || options.current(target)) continue;
        try { await options.navigate(target); } catch (error) { options.onError(error); }
      }
    } finally { running = false; }
  }
  return {
    request(hash: string) { pending = hash; void flush(); },
    hasPending: () => pending !== null,
    flush,
  };
}
