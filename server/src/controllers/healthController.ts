import type { RequestHandler } from 'express';
import type { HealthResponse } from '@api-sentinel/shared';

/**
 * `GET /api/health` – tells the client the backend is up.
 * Factory function: the version is passed in instead of read globally,
 * which keeps the controller easy to test.
 */
export function createHealthController(version: string): RequestHandler {
  return (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      version,
    };
    res.json(body);
  };
}
