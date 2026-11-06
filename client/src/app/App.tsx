import { BackendStatusBadge } from '../components/BackendStatusBadge';
import { useBackendHealth } from '../hooks/useBackendHealth';

export function App() {
  const health = useBackendHealth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">API Sentinel</h1>
        <BackendStatusBadge health={health} />
      </header>
      <main className="p-6 text-slate-500">
        {/* Dashboard layout and Request Builder come in steps 1.8–1.12. */}
        Request Builder coming soon.
      </main>
    </div>
  );
}
