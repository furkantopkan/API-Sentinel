import { useState } from 'react';
import { Button } from '../../../components/Button';
import type { FlowRecorder } from '../hooks/useFlowRecorder';

const field = 'w-full rounded-md border border-slate-300 px-2 py-1 text-sm font-normal';

/** Step one of the builder: the user shows the flow in a real browser window. */
export function FlowRecorderPanel({ recorder }: { recorder: FlowRecorder }) {
  const [address, setAddress] = useState('');
  const { phase, captured } = recorder;

  if (phase === 'checking') return null;

  if (phase === 'recording' || phase === 'finishing') {
    return (
      <div role="status" className="space-y-2 rounded-md bg-indigo-50 p-3 text-sm text-indigo-900">
        {phase === 'recording' ? (
          <>
            <p className="font-medium">Recording…</p>
            <p className="text-xs">
              Use the site in the browser window that opened, as a user would. Finish here or close
              that window when you are done.
            </p>
            <p className="text-xs">
              {captured} API request{captured === 1 ? '' : 's'} captured so far.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="md" onClick={() => void recorder.finish()}>
                Finish recording
              </Button>
              <Button size="md" onClick={() => void recorder.cancel()}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <p>Collecting the recording…</p>
        )}
      </div>
    );
  }

  if (phase === 'unavailable') return null;

  const starting = phase === 'starting';
  return (
    <form
      className="space-y-1"
      onSubmit={(event) => {
        event.preventDefault();
        void recorder.start(address);
      }}
    >
      <label className="block text-xs font-medium text-slate-600">
        Website to record
        <div className="mt-1 flex items-center gap-2">
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            aria-label="Website to record"
            maxLength={2048}
            placeholder="e.g. https://example.com"
            className={field}
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={address.trim() === '' || starting}
            className="shrink-0"
          >
            {starting ? 'Opening…' : 'Start recording'}
          </Button>
        </div>
      </label>
      <p className="text-xs text-slate-500">
        A separate browser opens with no saved logins. Do the flow once and API Sentinel captures
        the API calls it makes. Only test sites you are allowed to test.
      </p>
    </form>
  );
}
