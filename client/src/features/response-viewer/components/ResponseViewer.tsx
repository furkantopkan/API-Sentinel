/**
 * Response area. For now only the empty state; status, headers, body and
 * timing are added in Phase 2 when requests are actually sent.
 */
export function ResponseViewer() {
  return (
    <section aria-label="Response" className="flex h-full flex-col">
      <h2 className="border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">
        Response
      </h2>
      <div className="flex flex-1 flex-col items-center justify-center gap-1 py-12 text-center">
        <p className="text-sm font-medium text-slate-500">No response yet</p>
        <p className="text-xs text-slate-400">Send a request to see the response here.</p>
      </div>
    </section>
  );
}
