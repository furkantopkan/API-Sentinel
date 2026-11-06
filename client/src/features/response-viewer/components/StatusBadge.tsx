function colorFor(status: number): string {
  if (status >= 500) return 'bg-red-100 text-red-800';
  if (status >= 400) return 'bg-amber-100 text-amber-800';
  if (status >= 300) return 'bg-sky-100 text-sky-800';
  if (status >= 200) return 'bg-emerald-100 text-emerald-800';
  return 'bg-slate-100 text-slate-700';
}

/** "200 OK" in green, "404 Not Found" in amber, "500 ..." in red. */
export function StatusBadge({ status, statusText }: { status: number; statusText: string }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 font-mono text-sm font-semibold ${colorFor(status)}`}
      data-testid="response-status"
    >
      {status} {statusText}
    </span>
  );
}
