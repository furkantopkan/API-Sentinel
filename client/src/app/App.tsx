import { BackendStatusBadge } from '../components/BackendStatusBadge';
import { RequestBuilder } from '../features/request-builder/components/RequestBuilder';
import { ResponseViewer } from '../features/response-viewer/components/ResponseViewer';
import { useBackendHealth } from '../hooks/useBackendHealth';
import { useSendRequest } from '../hooks/useSendRequest';
import { Sidebar } from './Sidebar';

export function App() {
  const health = useBackendHealth();
  // The send state lives here because both the builder (Send/Cancel button)
  // and the viewer (response, error, loading) need it.
  const { state, send, cancel } = useSendRequest();

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">API Sentinel</h1>
        <BackendStatusBadge health={health} />
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <RequestBuilder
              onSend={(request) => void send(request)}
              onCancel={cancel}
              isSending={state.status === 'loading'}
            />
          </div>
          <div className="flex-1 rounded-lg border border-slate-200 bg-white p-4">
            <ResponseViewer state={state} />
          </div>
        </main>
      </div>
    </div>
  );
}
