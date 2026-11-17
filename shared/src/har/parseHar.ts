import { z } from 'zod';
import {
  MAX_ACTION,
  MAX_RECORDED_BODY,
  MAX_RECORDED_ENTRIES,
  MAX_RESPONSE_SAMPLE,
  type RecordedEntry,
} from '../schemas/builder';
import { HTTP_METHODS, type HttpMethod } from '../schemas/http';
import { FORM_CONTENT_TYPE, multipartToForm } from '../body/formBody';
import { looksLikeJson, responseSampleText } from './pageText';

/**
 * Reads a HAR file (the network log browsers can export) and keeps what a
 * test flow can use, without duplicates:
 * - API calls the page made (JSON answers, also when mislabelled as text);
 * - changes the page sent (POST, PUT, PATCH, DELETE), whatever they answer;
 * - the pages the user opened on the site, as plain text.
 * Images, scripts, styles and other sites' pages are left out. Runs in the
 * browser, so the full recording, which may be large and sensitive, never leaves it.
 */

const nameValue = z.object({ name: z.string(), value: z.string() });

const harSchema = z.object({
  log: z.object({
    entries: z.array(
      z.object({
        _resourceType: z.string().optional(),
        /** Set by API Sentinel's recorder: did the user cause this request? */
        _trigger: z.enum(['user', 'page']).optional(),
        /** Set by the recorder: what the user clicked, e.g. 'Click "Add to cart"'. */
        _action: z.string().optional(),
        request: z.object({
          method: z.string(),
          url: z.string(),
          headers: z.array(nameValue),
          postData: z.object({ text: z.string().optional() }).optional(),
        }),
        response: z.object({
          status: z.number(),
          content: z.object({
            mimeType: z.string().optional(),
            text: z.string().optional(),
            encoding: z.string().optional(),
          }),
        }),
      }),
    ),
  }),
});

/** One network exchange, as in a HAR file. The live recorder produces the same shape. */
export type HarEntry = z.infer<typeof harSchema>['log']['entries'][number];

/** Error reporting and analytics: never part of a flow, and they use up the entry limit. */
const TELEMETRY_URL =
  /\/api\/\d+\/(envelope|store)\/|\/cdn-cgi\/|\/\/([^/]*\.)?(sentry\.io|google-analytics\.com|analytics\.google\.com|googletagmanager\.com|doubleclick\.net|hotjar\.(com|io)|clarity\.ms|segment\.(io|com)|mixpanel\.com|amplitude\.com|nr-data\.net|fullstory\.com|datadoghq\.(com|eu))\//i;

/** Added by the browser or tied to its session; a saved request must not depend on them. */
const DROPPED_HEADERS = new Set([
  'accept-encoding',
  'cache-control',
  'connection',
  'content-length',
  'cookie',
  'host',
  'if-modified-since',
  'if-none-match',
  'origin',
  'pragma',
  'priority',
  'referer',
  'te',
  'user-agent',
]);

export type ParseHarResult =
  { ok: true; entries: RecordedEntry[]; found: number } | { ok: false; error: string };

function keepHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return !lower.startsWith(':') && !lower.startsWith('sec-') && !DROPPED_HEADERS.has(lower);
}

const isMethod = (method: string): method is HttpMethod =>
  (HTTP_METHODS as readonly string[]).includes(method);

/**
 * Analytics that a site sends through its own address (server-side tagging,
 * as on hepsiburada.com/metrics/gs/measurement/conversion): recognised by the
 * measurement ids in the query (tid=G-…, AW-…, gtm=…) or by a whole path part
 * that only analytics use. Whole parts only: /collections is not /collect.
 */
const ANALYTICS_QUERY = /[?&](tid=(G|UA|AW|DC|GT)-|gtm=|_gid=)/i;
const ANALYTICS_PART =
  /^(metrics|collect|measurement|telemetry|beacon|pixel|analytics|gtm|gtag|ccm|rmkt|pagead)$/i;

/**
 * A site's own tracking (seen on LinkedIn: POST /li/track, /litms/api/events/ext-tag-load).
 * Only for requests that send something: a GET .../track can be a real page (order tracking).
 */
const TRACKING_PART = /^(track(ing|er)?|ping|rum|impressions?|[\w-]*tag-?load)$/i;

export function isTrackingRequest(method: string, url: string): boolean {
  if (method.toUpperCase() === 'GET') return false;
  try {
    return new URL(url).pathname.split('/').some((part) => TRACKING_PART.test(part));
  } catch {
    return false;
  }
}

/** Error reporting, analytics and ads: never part of a flow. */
export function isNoiseUrl(url: string): boolean {
  return TELEMETRY_URL.test(url) || isAnalyticsUrl(url);
}

/**
 * A bot protection sensor (Akamai): the page sends one after every click, to
 * a random address on the site itself, so only its body gives it away. It is
 * not something the user did, and its answer does not show a result.
 */
export function isBotSensorBody(body: string): boolean {
  return /^\s*\{\s*"sensor_data"\s*:/.test(body);
}

/** The site an address belongs to (www.shop.com and api.shop.com are one), or null. */
export function siteOfUrl(url: string): string | null {
  return siteOf(hostOf(url));
}

export function isAnalyticsUrl(url: string): boolean {
  if (ANALYTICS_QUERY.test(url)) return true;
  try {
    return new URL(url).pathname.split('/').some((part) => ANALYTICS_PART.test(part));
  } catch {
    return false;
  }
}

/** Requests a page sends to fill its own boxes, also right after a click. */
const UI_REFRESH =
  /recommend|personali[sz]|seo|banner|advert|widget|suggest|dictionary|translation|i18n|top-?selling|best-?seller|trending|loyalty|\/navigation\/|\/menus?(\/|$|\?)/i;

/** Words in the address of an ad or tracking service; only applied to other sites. */
const TRACKING_WORD =
  /pixel|track|collect|analytic|telemetry|beacon|metric|adservice|pagead|doubleclick|\/ads?\/|\/sdk\/|\/ccm\/|\/rmkt\//i;

/** Second-level names under a country code, as in kitapyurdu.com.tr or bbc.co.uk. */
const SHARED_SECOND_LEVEL = new Set([
  'com',
  'net',
  'org',
  'gov',
  'edu',
  'co',
  'ac',
  'gen',
  'biz',
  'info',
  'k12',
  'bel',
  'web',
  'tv',
]);

/**
 * The site a host belongs to: www.shop.com and img.shop.com are one site.
 * An approximation of the public suffix list, enough to tell a shop from
 * the ad and tracking services it loads.
 */
function siteOf(host: string | null): string | null {
  if (host === null) return null;
  const name = host.replace(/:\d+$/, '').toLowerCase();
  if (/^[\d.]+$/.test(name) || name.startsWith('[') || !name.includes('.')) return name;
  const labels = name.split('.');
  const second = labels[labels.length - 2] ?? '';
  const countryCode = (labels[labels.length - 1] ?? '').length === 2;
  const keep = countryCode && SHARED_SECOND_LEVEL.has(second) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

function hostOf(url: string): string | null {
  try {
    const { protocol, host } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? host : null;
  } catch {
    return null;
  }
}

type Kind = 'api' | 'write' | 'page';

/** Which of the three useful kinds an exchange is, or null to leave it out. */
function kindOf(
  method: string,
  resourceType: string | undefined,
  mime: string,
  text: string,
  status: number,
): Kind | null {
  if (resourceType === 'document') {
    // A classic form (a login, a search) sends its data as a page load.
    if (method !== 'GET') return status < 400 ? 'write' : null;
    // Only pages that loaded; a redirect shows up again as the page it led to.
    return status >= 200 && status < 300 && /html/i.test(mime) ? 'page' : null;
  }
  // Chrome labels entries; other browsers do not, so the content decides too.
  if (resourceType !== undefined && resourceType !== 'xhr' && resourceType !== 'fetch') {
    return null;
  }
  if (/json/i.test(mime) || looksLikeJson(text)) return 'api';
  return method !== 'GET' && status < 400 ? 'write' : null;
}

/** Multipart forms become urlencoded forms, which the request builder can send. */
function requestBodyAndHeaders(
  text: string,
  headers: [string, string][],
): { body: string; headers: [string, string][] } {
  const contentType = headers.find(([name]) => name.toLowerCase() === 'content-type')?.[1] ?? '';
  const form = /multipart\/form-data/i.test(contentType)
    ? multipartToForm(text, contentType)
    : null;
  if (form === null) return { body: text, headers };
  return {
    body: form,
    headers: headers.map(([name, value]): [string, string] =>
      name.toLowerCase() === 'content-type' ? [name, FORM_CONTENT_TYPE] : [name, value],
    ),
  };
}

/**
 * What the user did, as opposed to what the page fetched by itself: a page
 * they opened, or a change the page sent (add to cart, remove, save...).
 * These must never be lost when a recording is shortened.
 */
export function isUserAction(
  entry: Pick<RecordedEntry, 'method' | 'responseContentType' | 'responseSample' | 'trigger'>,
): boolean {
  // The recorder saw the clicks; a HAR file did not, so it is judged by its kind.
  if (entry.trigger !== undefined) return entry.trigger === 'user';
  if (entry.method !== 'GET') return true;
  return /html/i.test(entry.responseContentType) && !looksLikeJson(entry.responseSample);
}

/**
 * Keeps at most `max` entries without losing the user's actions: background
 * reads are left out first, the latest ones first. Order is kept and the
 * entries are numbered again.
 */
export function keepActions(entries: readonly RecordedEntry[], max: number): RecordedEntry[] {
  if (entries.length <= max) return [...entries];
  // What is given up first when there are too many: background reads, then
  // reads after a click, then pages; changes (add to cart, remove) last.
  const rank = (entry: RecordedEntry): number => {
    if (!isUserAction(entry)) return 3;
    if (entry.method !== 'GET') return 0;
    return /html/i.test(entry.responseContentType) ? 1 : 2;
  };
  const kept = new Set(
    entries
      .map((entry, position) => ({ position, rank: rank(entry) }))
      .sort((a, b) => a.rank - b.rank || a.position - b.position)
      .slice(0, max)
      .map((item) => item.position),
  );
  return entries
    .filter((_entry, position) => kept.has(position))
    .map((entry, index) => ({ ...entry, index }));
}

/** Values in a JSON answer that could be reused later: ids, tokens, codes. */
function reusableValues(sample: string): Set<string> {
  const values = new Set<string>();
  let document: unknown;
  try {
    document = JSON.parse(sample) as unknown;
  } catch {
    return values;
  }
  const visit = (value: unknown, depth: number) => {
    if (depth > 20 || values.size > 500) return;
    if (Array.isArray(value)) value.forEach((item) => visit(item, depth + 1));
    else if (value !== null && typeof value === 'object') {
      Object.values(value).forEach((item) => visit(item, depth + 1));
    } else if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value);
      // Short values (1, "ok", true) would match by chance.
      if (text.length >= 4 && text.length <= 500 && /[\dA-Za-z]/.test(text)) values.add(text);
    }
  };
  visit(document, 0);
  return values;
}

/**
 * The user's actions, and the requests the site sent by itself only when a
 * later action uses a value from their answer (a cart id, a token): without
 * them the flow could not run. Everything else the site sent is left out.
 */
export function actionsAndWhatTheyNeed(entries: readonly RecordedEntry[]): RecordedEntry[] {
  return entries.filter((entry, position) => {
    if (isUserAction(entry)) return true;
    const values = reusableValues(entry.responseSample);
    if (values.size === 0) return false;
    return entries.slice(position + 1).some((later) => {
      if (!isUserAction(later)) return false;
      const sent = [later.url, later.requestBody, ...later.requestHeaders.map(([, v]) => v)].join(
        '\n',
      );
      return [...values].some((value) => sent.includes(value));
    });
  });
}

/** The path with its ids (any part holding a digit) as #: /product/7/detail -> /product/#/detail. */
function pathPattern(url: string): string {
  try {
    return new URL(url).pathname
      .split('/')
      .map((part) => (/\d/.test(part) ? '#' : part))
      .join('/');
  } catch {
    return url;
  }
}

export function parseHar(json: unknown): ParseHarResult {
  const parsed = harSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: 'This file is not a valid HAR recording.' };

  const seen = new Set<string>();
  const readsOfAction = new Set<string>();
  const entries: RecordedEntry[] = [];
  // The site is the one of the first page: pages of other sites (ads, widgets) are not part of the flow.
  const firstPage = parsed.data.log.entries.find((e) => e._resourceType === 'document');
  const site = firstPage ? siteOf(hostOf(firstPage.request.url)) : null;

  for (const entry of parsed.data.log.entries) {
    const { request, response, _resourceType: resourceType } = entry;
    let trigger = entry._trigger;
    const mime = response.content.mimeType ?? '';
    const method = request.method.toUpperCase();
    const host = hostOf(request.url);
    const text = response.content.encoding === 'base64' ? '' : (response.content.text ?? '');

    if (
      !isMethod(method) ||
      host === null ||
      TELEMETRY_URL.test(request.url) ||
      isBotSensorBody(request.postData?.text ?? '') ||
      isTrackingRequest(method, request.url) ||
      isAnalyticsUrl(request.url) ||
      request.url.length > 8192 ||
      response.status <= 0
    ) {
      continue;
    }
    // Classic sites answer a click with a bit of text or HTML (seen: GET
    // /add_to_cart/1 -> "Added To Cart"). Kept only when the user caused it:
    // the page loads such bits by itself all the time (widgets, ads).
    const userText =
      trigger === 'user' &&
      (resourceType === 'xhr' || resourceType === 'fetch') &&
      response.status >= 200 &&
      response.status < 300 &&
      /html|text\/plain/i.test(mime);
    const kind =
      kindOf(method, resourceType, mime, text, response.status) ?? (userText ? 'api' : null);
    if (kind === null) continue;
    // Another site: ads and tracking react to clicks too (accepting cookies
    // starts a burst of them). Only its JSON reads may belong to the flow, and
    // in a recording only to pass a value on to a later step of the site.
    if (site !== null && siteOf(host) !== site) {
      if (kind !== 'api' || TRACKING_WORD.test(request.url.split('?')[0] ?? '')) continue;
      if (method !== 'GET' || trigger !== undefined) trigger = 'page';
    }
    // A page redraws itself after a click: recommendations, personalisation,
    // SEO texts. They follow the click but are not what the user did.
    if (trigger === 'user' && kind !== 'page' && UI_REFRESH.test(request.url)) trigger = 'page';
    // One click, the same read for many items (seen on a shop: opening a product
    // loaded the details of 20 others): the first one stands for all of them.
    if (trigger === 'user' && kind === 'api' && method === 'GET' && entry._action) {
      const pattern = `${entry._action} ${host}${pathPattern(request.url)}`;
      if (readsOfAction.has(pattern)) trigger = 'page';
      readsOfAction.add(pattern);
    }

    // A read asked twice is the same check. A change to the same address with
    // another body (quantity up, then down) is another thing the user did; the
    // very same body twice is the page repeating itself.
    const key =
      method === 'GET'
        ? `${method} ${request.url}`
        : `${method} ${request.url}\n${request.postData?.text ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const recorded = requestBodyAndHeaders(
      request.postData?.text ?? '',
      request.headers
        .filter((header) => keepHeader(header.name))
        .slice(0, 50)
        .map((header): [string, string] => [
          header.name.slice(0, 1024),
          header.value.slice(0, 8192),
        ]),
    );
    entries.push({
      index: entries.length,
      method,
      url: request.url,
      status: Math.trunc(response.status),
      requestHeaders: recorded.headers,
      requestBody: recorded.body.slice(0, MAX_RECORDED_BODY),
      responseContentType: mime.slice(0, 200),
      responseSample: responseSampleText(mime, text).slice(0, MAX_RESPONSE_SAMPLE),
      ...(trigger === undefined ? {} : { trigger }),
      // Only the user's own requests are named after what they clicked.
      ...(trigger === 'user' && entry._action
        ? { action: entry._action.slice(0, MAX_ACTION) }
        : {}),
    });
  }

  // With the recorder's click information, only the user's actions are used,
  // plus what they depend on. A HAR file has no such information.
  const recorded = entries.some((entry) => entry.trigger !== undefined);
  const used = recorded ? actionsAndWhatTheyNeed(entries) : entries;
  return {
    ok: true,
    entries: keepActions(used, MAX_RECORDED_ENTRIES).map((entry, index) => ({ ...entry, index })),
    found: entries.length,
  };
}
