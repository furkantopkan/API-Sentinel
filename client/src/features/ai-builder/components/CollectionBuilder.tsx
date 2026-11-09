import {
  parseHar,
  type AiMeta,
  type CollectionDraft,
  type RecordedEntry,
} from '@api-sentinel/shared';
import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '../../../components/Button';
import { buildCollection, collectionsApi } from '../../../services/apiClient';
import { unwrap } from '../../collections/hooks/useCollections';
import type { Environments } from '../../environments/hooks/useEnvironments';
import { useFlowRecorder } from '../hooks/useFlowRecorder';
import { draftToImport, isReadOnly, missingCaptures } from '../lib/draftToImport';
import { FlowRecorderPanel } from './FlowRecorderPanel';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const field = 'w-full rounded-md border border-slate-300 px-2 py-1 text-sm';
/** Used when the user just shows the flow and writes nothing. */
const DEFAULT_GOAL = 'Test the recorded flow step by step and verify each response.';

interface Props {
  environments: Environments;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * A recorded flow (live, or from a HAR file) + an optional goal → AI draft →
 * the user reviews it → collection.
 * The AI sends no requests here: it only proposes, and nothing is saved
 * until "Create collection".
 */
export function CollectionBuilder({ environments, onClose, onCreated }: Props) {
  const [goal, setGoal] = useState('');
  const [entries, setEntries] = useState<RecordedEntry[] | null>(null);
  const [found, setFound] = useState(0);
  const [draft, setDraft] = useState<{ result: CollectionDraft; meta: AiMeta } | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'building' | 'creating' | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const acceptRecording = useCallback((recording: { entries: RecordedEntry[]; found: number }) => {
    setDraft(null);
    if (recording.entries.length === 0) {
      setEntries(null);
      setError('No API requests were captured. Use the part of the site that loads data.');
      return;
    }
    setEntries(recording.entries);
    setFound(recording.found);
  }, []);
  const recorder = useFlowRecorder(acceptRecording);
  const recording = recorder.phase === 'recording' || recorder.phase === 'finishing';

  const close = () => {
    if (recorder.phase === 'recording') void recorder.cancel();
    onClose();
  };

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setEntries(null);
    setDraft(null);
    setError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError('This file is larger than 50 MB. Record only the flow you want to test.');
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      setError('This file is not a valid HAR recording.');
      return;
    }
    const parsed = parseHar(json);
    if (!parsed.ok) {
      setError(parsed.error);
    } else if (parsed.entries.length === 0) {
      setError('No API requests (JSON responses) were found in this recording.');
    } else {
      setEntries(parsed.entries);
      setFound(parsed.found);
    }
  };

  const build = async () => {
    if (!entries) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy('building');
    setError(null);
    const result = await unwrap(
      buildCollection({ goal: goal.trim() || DEFAULT_GOAL, entries }, controller.signal),
    );
    if (controller.signal.aborted) return;
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDraft({ result: result.data.result, meta: result.data.meta });
    setName(result.data.result.collectionName);
    setSelected(
      new Set(result.data.result.steps.flatMap((step, index) => (isReadOnly(step) ? [index] : []))),
    );
  };

  const cancel = () => {
    controllerRef.current?.abort();
    setBusy(null);
  };

  const toggle = (index: number) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const unresolved = draft ? missingCaptures(draft.result, selected) : [];

  const create = async () => {
    if (!draft) return;
    setBusy('creating');
    setError(null);
    const { variables } = draft.result;
    if (variables.length > 0) {
      const saved = await environments.save(null, {
        name,
        variables: variables.map((v) => ({
          key: v.key,
          value: v.value,
          isSecret: v.secret,
          enabled: true,
        })),
      });
      if (!saved.ok) {
        setBusy(null);
        setError(saved.message);
        return;
      }
      environments.select(saved.environment.id);
    }
    const result = await unwrap(
      collectionsApi.importCollection(draftToImport(draft.result, name, selected)),
    );
    setBusy(null);
    if (result.ok) onCreated();
    else setError(result.message);
  };

  const blankSecrets = draft?.result.variables.filter((v) => v.secret).map((v) => v.key) ?? [];

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Build collection with AI"
        className="flex max-h-full w-full max-w-3xl flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 shadow-xl"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Build a collection with AI</h2>
          <Button variant="ghost" danger size="md" onClick={close} aria-label="Close">
            ✕
          </Button>
        </header>

        {!draft && (
          <>
            <FlowRecorderPanel recorder={recorder} />
            {entries && !recording && (
              <p className="text-xs text-slate-600">
                {found} API request{found === 1 ? '' : 's'} found
                {found > entries.length && `; the first ${entries.length} will be used`}.
              </p>
            )}
            <label className="block text-xs font-medium text-slate-600">
              What do you want to test? (optional)
              <textarea
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                aria-label="Test goal"
                maxLength={2000}
                rows={3}
                placeholder="e.g. Search for a user, then check their repositories and followers. Leave empty to test the whole flow."
                className={`${field} mt-1 font-normal`}
              />
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => void build()}
                disabled={!entries || recording || busy !== null}
              >
                {busy === 'building' ? 'Building… usually under a minute' : 'Build draft'}
              </Button>
              {busy === 'building' && (
                <Button variant="ghost" size="md" onClick={cancel}>
                  Cancel
                </Button>
              )}
            </div>
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer">Advanced: use a HAR file instead</summary>
              <div className="mt-2 space-y-2">
                <ol className="list-decimal space-y-0.5 pl-5">
                  <li>In Chrome press F12, open Network and enable “Preserve log”.</li>
                  <li>Do the flow you want to test on the site.</li>
                  <li>Right-click the request list and choose “Save all as HAR with content”.</li>
                </ol>
                <p className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">
                  A HAR file can contain session data. Cookies stay in your browser; other
                  credentials are masked before anything is sent to the AI service.
                </p>
                <label className="block font-medium">
                  HAR file
                  <input
                    type="file"
                    accept=".har,application/json"
                    onChange={(event) => void loadFile(event)}
                    aria-label="HAR file"
                    className="mt-1 block w-full"
                  />
                </label>
              </div>
            </details>
          </>
        )}

        {draft && (
          <>
            <label className="block text-xs font-medium text-slate-600">
              Collection name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                className={`${field} mt-1 font-normal`}
              />
            </label>

            <ul aria-label="Draft steps" className="space-y-1.5">
              {draft.result.steps.map((step, index) => (
                <li key={index} className="rounded-md border border-slate-200 p-2 text-xs">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(index)}
                      onChange={() => toggle(index)}
                      aria-label={`Include step ${index + 1}`}
                      className="mt-0.5 h-4 w-4 accent-indigo-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-800">
                        {index + 1}. {step.name}
                      </span>
                      <code className="block font-mono break-all text-slate-500">
                        {step.method} {step.url}
                      </code>
                      <span className="text-slate-500">
                        {step.assertions.length} assertions
                        {step.captures.length > 0 &&
                          ` · passes on: ${step.captures.map((c) => c.variable).join(', ')}`}
                      </span>
                      {!isReadOnly(step) && (
                        <span className="block text-amber-700">
                          Changes data on the server. Off by default.
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            {draft.result.steps.length === 0 && (
              <p className="text-sm text-slate-600">
                No usable steps were produced. Try a clearer goal or a recording of the flow.
              </p>
            )}
            {unresolved.length > 0 && (
              <p role="alert" className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">
                A selected step needs a value from a step that is off:{' '}
                {unresolved.map((v) => `{{${v}}}`).join(', ')}.
              </p>
            )}
            {blankSecrets.length > 0 && (
              <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                Enter these secrets under Manage before running:{' '}
                {blankSecrets.map((v) => `{{${v}}}`).join(', ')}.
              </p>
            )}
            {draft.result.notes.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-600">
                {draft.result.notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-400">
              {draft.meta.mock ? 'Mock AI (AI_MODE=mock)' : `Model: ${draft.meta.model}`}
              {draft.meta.droppedItems > 0 &&
                ` · ${draft.meta.droppedItems} step(s) removed: not traceable to the recording`}
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => void create()}
                disabled={
                  busy !== null ||
                  selected.size === 0 ||
                  name.trim() === '' ||
                  unresolved.length > 0
                }
              >
                {busy === 'creating' ? 'Creating…' : `Create collection (${selected.size})`}
              </Button>
              <Button size="md" onClick={() => setDraft(null)} disabled={busy !== null}>
                Back
              </Button>
            </div>
          </>
        )}

        {(error ?? recorder.error) && (
          <p role="alert" className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">
            {error ?? recorder.error}
          </p>
        )}
      </div>
    </div>
  );
}
