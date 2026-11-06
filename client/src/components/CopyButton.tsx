import { useEffect, useState } from 'react';
import { Button } from './Button';

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
    <Button onClick={() => void handleClick()}>
      {state === 'copied' ? 'Copied!' : state === 'failed' ? 'Copy failed' : label}
    </Button>
  );
}
