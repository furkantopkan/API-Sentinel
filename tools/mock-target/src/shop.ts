import express, { type Express, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * A tiny shop that behaves like many classic sites: the cart lives in a
 * session cookie, "add to cart" takes a form (urlencoded or multipart) and
 * answers JSON labelled as text/html, and the cart is an HTML page.
 *
 *   GET  /shop/product/:id      product page
 *   POST /shop/cart/add         form field product_id
 *   GET  /shop/cart             cart page
 *   POST /shop/cart/remove?remove=:id
 *   GET  /shop/flow             a page that adds a product and opens the cart by itself (recorder tests)
 */

export const SHOP_COOKIE = 'shop_session';
const MAX_SESSIONS = 1000;

export const productName = (id: string) => `Mock Book ${id}`;

function readCookie(req: Request): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SHOP_COOKIE) return value.join('=');
  }
  return undefined;
}

/** Fields of a multipart body; enough for text fields, which is all the shop needs. */
function multipartFields(req: Request): Record<string, string> {
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(req.headers['content-type'] ?? '');
  const marker = boundary?.[1] ?? boundary?.[2];
  if (!marker || typeof req.body !== 'string') return {};
  const fields: Record<string, string> = {};
  for (const part of req.body.split(`--${marker}`)) {
    const match = /name="([^"]+)"\r?\n\r?\n([\s\S]*?)\r?\n$/.exec(part);
    if (match) fields[match[1]!] = match[2]!;
  }
  return fields;
}

export function addShopRoutes(app: Express): void {
  const carts = new Map<string, Set<string>>();

  /** Like a real shop, a visitor without a session gets a new, empty one. */
  const cartOf = (req: Request, res: Response): Set<string> => {
    const id = readCookie(req);
    const existing = id === undefined ? undefined : carts.get(id);
    if (existing) return existing;
    if (carts.size >= MAX_SESSIONS) carts.clear();
    const fresh = randomUUID();
    const cart = new Set<string>();
    carts.set(fresh, cart);
    res.append('Set-Cookie', `${SHOP_COOKIE}=${fresh}; Path=/; HttpOnly`);
    return cart;
  };

  const page = (res: Response, title: string, body: string) =>
    res
      .type('html')
      .send(`<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`);

  app.get('/shop/product/:id', (req, res) => {
    cartOf(req, res);
    const id = req.params.id.replace(/\D/g, '').slice(0, 9) || '1';
    page(res, productName(id), `<h1>${productName(id)}</h1><button>Add to cart</button>`);
  });

  app.post(
    '/shop/cart/add',
    express.urlencoded({ extended: false, limit: '10kb' }),
    express.text({ type: 'multipart/form-data', limit: '10kb' }),
    (req, res) => {
      const cart = cartOf(req, res);
      const fields: Record<string, unknown> =
        typeof req.body === 'string'
          ? multipartFields(req)
          : ((req.body ?? {}) as Record<string, unknown>);
      const id = typeof fields.product_id === 'string' ? fields.product_id.replace(/\D/g, '') : '';
      if (id === '') {
        res
          .status(400)
          .type('html')
          .send(JSON.stringify({ error: 'product_id is required' }));
        return;
      }
      cart.add(id);
      // JSON with a wrong label, as some real shops send it.
      res
        .type('html')
        .send(JSON.stringify({ success: `${productName(id)} added`, count: cart.size }));
    },
  );

  app.get('/shop/cart', (req, res) => {
    const cart = cartOf(req, res);
    const items = [...cart].map((id) => `<li>${productName(id)}</li>`).join('');
    page(res, 'My cart', cart.size === 0 ? '<p>Your cart is empty</p>' : `<ul>${items}</ul>`);
  });

  app.post('/shop/cart/remove', (req, res) => {
    const cart = cartOf(req, res);
    const id = typeof req.query.remove === 'string' ? req.query.remove : '';
    const removed = cart.delete(id);
    page(res, 'My cart', removed ? `<p>${productName(id)} removed</p>` : '<p>Not in your cart</p>');
  });

  // A product link that opens in a new tab, as shops often do (clicked by the page for automated tests).
  app.get('/shop/tab-flow', (_req, res) => {
    page(
      res,
      'Shop list',
      `<a href="/shop/product/7" target="_blank">${productName('7')}</a>
      <script>setTimeout(() => document.querySelector('a').click(), 500);</script>`,
    );
  });

  app.get('/shop/flow', (_req, res) => {
    page(
      res,
      'Shop flow',
      // The page clicks its own button, as automated tests cannot reach the recording window.
      `<button>Add to cart</button><script>
        document.querySelector('button').addEventListener('click', () => {
          const form = new FormData();
          form.append('product_id', '7');
          fetch('/shop/cart/add', { method: 'POST', body: form }).then(() => { location.href = '/shop/cart'; });
        });
        setTimeout(() => document.querySelector('button').click(), 500);
      </script>`,
    );
  });
}
