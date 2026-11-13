/**
 * Form bodies (application/x-www-form-urlencoded), the format classic HTML
 * forms send: name=Ada&role=qa. A request uses one when its Content-Type
 * header says so; every other body must be JSON.
 */

export const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

interface HeaderRow {
  key: string;
  value: string;
  enabled: boolean;
}

export function isFormContentType(value: string): boolean {
  return value.toLowerCase().includes(FORM_CONTENT_TYPE);
}

/**
 * The Content-Type of a body that is sent as typed: anything declared that is
 * not JSON (a form, plain text, XML). Null means the body must be JSON, which
 * is also the default when no Content-Type is given.
 */
export function bodySentAsTyped(headers: readonly HeaderRow[]): string | null {
  const declared = headers.find(
    (row) =>
      row.enabled && row.key.trim().toLowerCase() === 'content-type' && row.value.trim() !== '',
  );
  return declared && !/json/i.test(declared.value) ? declared.value.trim() : null;
}

export function isFormBody(headers: readonly HeaderRow[]): boolean {
  return headers.some(
    (row) =>
      row.enabled &&
      row.key.trim().toLowerCase() === 'content-type' &&
      isFormContentType(row.value),
  );
}

/**
 * Browsers often send forms as multipart/form-data. Its text fields mean the
 * same as a urlencoded form, which most servers accept too and which, unlike
 * multipart, has no random boundary to keep in sync with a header.
 * Returns null when the body cannot be converted faithfully: a file upload,
 * or a body that was cut off.
 */
export function multipartToForm(body: string, contentType: string): string | null {
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const marker = boundary?.[1] ?? boundary?.[2];
  if (!marker) return null;

  const parts = body.split(`--${marker}`);
  // Before the first marker there is nothing; after the last one, "--".
  if (parts.length < 2 || !parts[parts.length - 1]!.startsWith('--')) return null;

  const form = new URLSearchParams();
  for (const part of parts.slice(1, -1)) {
    const split = /\r?\n\r?\n/.exec(part);
    if (!split) return null;
    const head = part.slice(0, split.index);
    if (/filename=/i.test(head)) return null;
    const name = /name="([^"]*)"/i.exec(head)?.[1];
    if (name === undefined) return null;
    form.append(name, part.slice(split.index + split[0].length).replace(/\r?\n$/, ''));
  }
  return form.toString();
}
