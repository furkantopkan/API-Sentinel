/**
 * The readable text of an HTML page, one piece per line, so the AI sees the
 * title and visible words instead of markup and scripts.
 *
 * Pieces are copied exactly as they appear in the source (entities are not
 * decoded and inner spacing is kept), so any piece the AI picks for a "body
 * contains" assertion can really be found in the page.
 */
/** A JSON object or array, whatever the server called it. */
export function looksLikeJson(text: string): boolean {
  if (!/^\s*[[{]/.test(text)) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * What the AI sees of a response: a page as its text, anything else as is.
 * JSON labelled as text/html stays JSON, or its paths would be lost.
 */
export function responseSampleText(mime: string, body: string): string {
  return /html/i.test(mime) && !looksLikeJson(body) ? pageText(body) : body;
}

export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .split(/<[^>]*>/)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '')
    .join('\n');
}
