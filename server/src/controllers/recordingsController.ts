import { finishRecordingRequestSchema, startRecordingRequestSchema } from '@api-sentinel/shared';
import type { RequestHandler } from 'express';
import type { RecorderService } from '../services/recorder/recorderService';
import { parseBody } from '../validators/parseBody';

export function createRecordingsControllers(recorder: RecorderService) {
  const status: RequestHandler = (_req, res) => {
    res.json({ ok: true, status: recorder.status() });
  };

  const start: RequestHandler = async (req, res) => {
    const { url } = parseBody(startRecordingRequestSchema, req.body);
    await recorder.start(url);
    res.status(201).json({ ok: true, status: recorder.status() });
  };

  // A JSON body is required on purpose: another website cannot send one
  // to this server without a CORS preflight, which is never allowed here.
  const finish: RequestHandler = async (req, res) => {
    parseBody(finishRecordingRequestSchema, req.body);
    res.json(await recorder.finish());
  };

  const cancel: RequestHandler = async (_req, res) => {
    await recorder.cancel();
    res.json({ ok: true, status: recorder.status() });
  };

  return { status, start, finish, cancel };
}
