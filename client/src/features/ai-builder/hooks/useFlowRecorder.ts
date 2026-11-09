import type { FinishRecordingResponse, RecordingStatus } from '@api-sentinel/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { recordingsApi } from '../../../services/apiClient';
import { unwrap } from '../../collections/hooks/useCollections';
import { normalizeSiteUrl } from '../lib/siteUrl';

export type RecorderPhase =
  'checking' | 'unavailable' | 'idle' | 'starting' | 'recording' | 'finishing';

const POLL_INTERVAL_MS = 1000;

/**
 * Follows the recording running on the backend. The status is polled because
 * the user acts in another window; closing that window counts as "finished".
 */
export function useFlowRecorder(onRecorded: (recording: FinishRecordingResponse) => void) {
  const [phase, setPhase] = useState<RecorderPhase>('checking');
  const [captured, setCaptured] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // The poll loop must see the latest callback without restarting.
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  const applyStatus = useCallback((status: RecordingStatus) => {
    setCaptured(status.captured);
    if (!status.available) setPhase('unavailable');
    else setPhase(status.active ? 'recording' : 'idle');
  }, []);

  useEffect(() => {
    let live = true;
    void unwrap(recordingsApi.status()).then((result) => {
      if (!live) return;
      if (result.ok) applyStatus(result.data.status);
      else {
        setError(result.message);
        setPhase('unavailable');
      }
    });
    return () => {
      live = false;
    };
  }, [applyStatus]);

  const finish = useCallback(async () => {
    setPhase('finishing');
    setError(null);
    const result = await unwrap(recordingsApi.finish());
    setPhase('idle');
    setCaptured(0);
    if (result.ok) onRecordedRef.current(result.data);
    else setError(result.message);
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const result = await unwrap(recordingsApi.status());
      if (!live) return;
      if (!result.ok) {
        setError(result.message);
      } else if (!result.data.status.active) {
        setError('The recording ended before it was collected. Please record the flow again.');
        applyStatus(result.data.status);
        return;
      } else if (!result.data.status.browserOpen) {
        void finish();
        return;
      } else {
        setCaptured(result.data.status.captured);
      }
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };
    timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [phase, finish, applyStatus]);

  const start = useCallback(async (address: string) => {
    setPhase('starting');
    setError(null);
    const result = await unwrap(recordingsApi.start(normalizeSiteUrl(address)));
    if (result.ok) {
      setPhase('recording');
    } else {
      setError(result.message);
      setPhase('idle');
    }
  }, []);

  const cancel = useCallback(async () => {
    const result = await unwrap(recordingsApi.cancel());
    setCaptured(0);
    setPhase('idle');
    if (!result.ok) setError(result.message);
  }, []);

  return { phase, captured, error, start, finish, cancel };
}

export type FlowRecorder = ReturnType<typeof useFlowRecorder>;
