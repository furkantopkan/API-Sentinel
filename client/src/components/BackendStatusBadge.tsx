import type { BackendHealth } from '../hooks/useBackendHealth';

interface BackendStatusBadgeProps {
  health: BackendHealth;
}

const STYLES: Record<BackendHealth['state'], { dot: string; text: string }> = {
  checking: { dot: 'bg-slate-400 animate-pulse', text: 'text-slate-500' },
  online: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  offline: { dot: 'bg-red-500', text: 'text-red-700' },
};

function labelFor(health: BackendHealth): string {
  switch (health.state) {
    case 'checking':
      return 'Checking backend…';
    case 'online':
      return `Backend online · v${health.version}`;
    case 'offline':
      return 'Backend offline';
  }
}

/** Presentational only: receives the health state, does not fetch anything. */
export function BackendStatusBadge({ health }: BackendStatusBadgeProps) {
  const style = STYLES[health.state];
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm ${style.text}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${style.dot}`} />
      {labelFor(health)}
    </span>
  );
}
