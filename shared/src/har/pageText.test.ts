import { describe, expect, it } from 'vitest';
import { pageText } from './pageText';

describe('pageText', () => {
  it('keeps the title and visible text, one piece per line, without scripts or styles', () => {
    const html = `<!doctype html><html><head><title>Runik Bilgi Seti</title>
      <style>.a { color: red }</style><script>var cart = "<b>no</b>";</script></head>
      <body><!-- hidden --><h1>Sepetim</h1><p>Toplam:  <b>120 TL</b></p><noscript>enable js</noscript></body></html>`;
    expect(pageText(html)).toBe('Runik Bilgi Seti\nSepetim\nToplam:\n120 TL');
  });

  // An assertion copied from the text must be found in the real page.
  it('copies each piece exactly as in the source', () => {
    const html = '<p>Tom &amp; Jerry  ile   Kitap</p>';
    const piece = pageText(html);
    expect(piece).toBe('Tom &amp; Jerry  ile   Kitap');
    expect(html).toContain(piece);
  });
});
