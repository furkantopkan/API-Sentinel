import type { RecordedEntry } from '@api-sentinel/shared';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * What a recording contains, in the user's terms. With the recorder's click
 * information the count is the user's own actions, not every request the
 * site made in the background; a HAR file has no such information.
 */
export function recordingSummary(entries: readonly RecordedEntry[], found: number): string {
  const yours = entries.filter((entry) => entry.trigger === 'user').length;
  if (entries.some((entry) => entry.trigger !== undefined)) {
    const needed = entries.length - yours;
    const left = found - entries.length;
    return [
      `${plural(yours, 'request')} from your actions`,
      needed > 0 ? `, plus ${plural(needed, 'request')} the site sent that they need` : '',
      '.',
      left > 0 ? ` ${plural(left, 'other request')} the site sent by itself will not be used.` : '',
    ].join('');
  }
  return found > entries.length
    ? `${plural(found, 'request')} found; the first ${entries.length} will be used.`
    : `${plural(found, 'request')} found.`;
}
