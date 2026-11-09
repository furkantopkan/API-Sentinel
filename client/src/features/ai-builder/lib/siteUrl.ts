/** People type "example.com"; the recorder needs a full address. */
export function normalizeSiteUrl(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
