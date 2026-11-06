import type { SendError } from '../../../hooks/useSendRequest';

/** Short, practical next steps for the errors a QA engineer will meet most. */
const HINTS: Partial<Record<SendError['code'], string>> = {
  BLOCKED_TARGET:
    'For security, the server does not call private or local addresses. To test a local API, add its host:port to SSRF_ALLOWLIST in .env and restart the server.',
  TIMEOUT: 'Increase the timeout in the Settings tab, or check whether the target is overloaded.',
  DNS_ERROR: 'Check the host name for typos and your internet connection.',
  CONNECTION_ERROR: 'Check that the target server is running and the port is correct.',
  RESPONSE_TOO_LARGE: 'The response exceeds RESPONSE_MAX_BYTES. Request less data (e.g. paging).',
  TOO_MANY_REDIRECTS:
    'The target keeps redirecting. Disable "Follow redirects" to inspect the first response.',
  BACKEND_UNREACHABLE: 'Start the backend with "npm run dev" (or "npm run dev:server").',
};

export function ErrorView({ error }: { error: SendError }) {
  const hint = HINTS[error.code];
  return (
    <div role="alert" className="space-y-2 rounded-md border border-red-200 bg-red-50 p-4">
      <p className="font-mono text-xs font-semibold text-red-800">{error.code}</p>
      <p className="text-sm text-red-900">{error.message}</p>
      {hint && <p className="text-xs text-red-700">{hint}</p>}
      <p className="text-xs text-red-600/80">
        No response was received from the target. This is not an HTTP status of the target API.
      </p>
    </div>
  );
}
