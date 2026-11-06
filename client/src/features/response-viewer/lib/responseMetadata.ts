import type { ExecutedResponse } from '@api-sentinel/shared';

export interface MetadataRow {
  label: string;
  value: string;
  /** Short explanation shown as a tooltip / helper text. */
  hint?: string;
}

function header(response: ExecutedResponse, name: string): string | undefined {
  const values = response.headers
    .filter(([key]) => key.toLowerCase() === name)
    .map(([, value]) => value);
  return values.length > 0 ? values.join(', ') : undefined;
}

const STATUS_CLASSES: Record<number, string> = {
  1: 'Informational',
  2: 'Success',
  3: 'Redirection',
  4: 'Client error',
  5: 'Server error',
};

/**
 * Facts about the response that are useful when analysing it, derived from
 * status and headers. Pure function: easy to unit test.
 */
export function responseMetadata(response: ExecutedResponse): MetadataRow[] {
  const rows: MetadataRow[] = [];
  const statusClass = STATUS_CLASSES[Math.floor(response.status / 100)] ?? 'Unknown';
  rows.push({
    label: 'Status',
    value: `${response.status} ${response.statusText}`.trim() + ` (${statusClass})`,
  });

  rows.push({
    label: 'Content-Type',
    value: header(response, 'content-type') ?? '(not set)',
    hint: 'How the server says the body should be interpreted.',
  });

  const encoding = header(response, 'content-encoding');
  rows.push({
    label: 'Content-Encoding',
    value: encoding ?? 'none',
    hint: encoding ? 'The body was compressed on the wire and decoded by API Sentinel.' : undefined,
  });

  const contentLength = header(response, 'content-length');
  rows.push({
    label: 'Body size',
    value:
      contentLength !== undefined && Number(contentLength) !== response.sizeBytes
        ? `${response.sizeBytes} bytes decoded (Content-Length on the wire: ${contentLength})`
        : `${response.sizeBytes} bytes`,
  });

  rows.push({
    label: 'Duration',
    value: `${response.durationMs} ms`,
    hint: 'Measured by the server, including redirects.',
  });

  for (const [label, name] of [
    ['Server', 'server'],
    ['Date', 'date'],
    ['Cache-Control', 'cache-control'],
  ] as const) {
    const value = header(response, name);
    if (value !== undefined) rows.push({ label, value });
  }

  rows.push({ label: 'Header count', value: String(response.headers.length) });
  rows.push({ label: 'Final URL', value: response.finalUrl });
  rows.push({
    label: 'Redirects',
    value:
      response.redirects.length === 0
        ? 'none'
        : response.redirects.map((r, i) => `${i + 1}. ${r.status} → ${r.location}`).join('\n'),
  });

  return rows;
}
