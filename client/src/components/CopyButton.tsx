import { useEffect, useState } from 'react';

type CopyState = 'idle' | 'copied' | 'failed';

/** Copies `text` to the clipboard and shows short feedback. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = window.setTimeout(() => setState('idle'), 1500);
    return () => window.clearTimeout(timer);
  }, [state]);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      // e.g. clipboard permission denied: tell the user instead of failing silently
      setState('failed');
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      {state === 'copied' ? 'Copied!' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}
