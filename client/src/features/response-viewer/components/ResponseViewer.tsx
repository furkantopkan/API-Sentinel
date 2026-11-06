import type { ExecutedResponse } from '@api-sentinel/shared';
import { useState } from 'react';
import { Tabs } from '../../../components/Tabs';
import type { SendState } from '../../../hooks/useSendRequest';
import { formatBytes, formatDuration } from '../lib/formatBytes';
import { ErrorView } from './ErrorView';
import { HeadersTable } from './HeadersTable';
import { ResponseBodyView } from './ResponseBodyView';
import { ResponseMetadata } from './ResponseMetadata';
import { StatusBadge } from './StatusBadge';

type ResponseTabId = 'body' | 'headers' | 'info';

function CenteredMessage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 py-12 text-center">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="text-xs text-slate-400">{subtitle}</p>
    </div>
  );
}

function SuccessView({ response }: { response: ExecutedResponse }) {
  const [activeTab, setActiveTab] = useState<ResponseTabId>('body');
  const redirected = response.redirects.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <StatusBadge status={response.status} statusText={response.statusText} />
        <span>
          Time <strong className="text-slate-700">{formatDuration(response.durationMs)}</strong>
        </span>
        <span title="Size of the decoded response body">
          Size <strong className="text-slate-700">{formatBytes(response.sizeBytes)}</strong>
        </span>
        {redirected && (
          <span title={response.redirects.map((r) => `${r.status} → ${r.location}`).join('\n')}>
            {response.redirects.length} redirect{response.redirects.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {redirected && (
        <p className="truncate font-mono text-xs text-slate-400" title={response.finalUrl}>
          Final URL: {response.finalUrl}
        </p>
      )}

      <Tabs
        tabs={[
          { id: 'body', label: 'Body' },
          { id: 'headers', label: 'Headers', count: response.headers.length },
          { id: 'info', label: 'Info' },
        ]}
        activeId={activeTab}
        onChange={setActiveTab}
        ariaLabel="Response sections"
      />
      <div role="tabpanel">
        {activeTab === 'body' && (
          <ResponseBodyView body={response.body} sizeBytes={response.sizeBytes} />
        )}
        {activeTab === 'headers' && <HeadersTable headers={response.headers} />}
        {activeTab === 'info' && <ResponseMetadata response={response} />}
      </div>
    </div>
  );
}

/** Shows one of: empty, loading, cancelled, error or the received response. */
export function ResponseViewer({ state }: { state: SendState }) {
  return (
    <section
      aria-label="Response"
      className="flex h-full flex-col gap-3"
      aria-busy={state.status === 'loading'}
    >
      <h2 className="border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">
        Response
      </h2>

      {state.status === 'idle' && (
        <CenteredMessage
          title="No response yet"
          subtitle="Send a request to see the response here."
        />
      )}

      {state.status === 'loading' && (
        <div className="flex flex-1 items-center justify-center gap-2 py-12 text-sm text-slate-500">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600"
          />
          Sending request…
        </div>
      )}

      {state.status === 'cancelled' && (
        <CenteredMessage title="Request cancelled" subtitle="Press Send to try again." />
      )}

      {state.status === 'error' && <ErrorView error={state.error} />}

      {/* key: a NEW response (not a re-render) resets the tab and "show all" state */}
      {state.status === 'success' && <SuccessView key={state.id} response={state.response} />}
    </section>
  );
}
