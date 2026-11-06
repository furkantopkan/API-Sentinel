import { Agent, type Dispatcher } from 'undici';
import { assertIpLiteralAllowed, guardedLookup, isAllowlisted } from './ssrfGuard';

/**
 * undici "dispatchers" (connection pools) used for outbound requests.
 *
 * - guarded: every connection goes through guardedLookup (SSRF check at connect time).
 * - trusted: no check; only used for host:port pairs listed in SSRF_ALLOWLIST.
 *
 * Using our own Agent also means HTTP(S)_PROXY environment variables are ignored,
 * so requests cannot be routed through a proxy that skips these checks.
 */
export interface Dispatchers {
  guarded: Agent;
  trusted: Agent;
}

export function createDispatchers(): Dispatchers {
  return {
    guarded: new Agent({ connect: { lookup: guardedLookup } }),
    trusted: new Agent(),
  };
}

/**
 * Picks the dispatcher for one request hop. Throws BlockedTargetError for a
 * blocked IP literal, which never reaches the DNS-based check.
 */
export function selectDispatcher(
  url: URL,
  allowlist: ReadonlySet<string>,
  dispatchers: Dispatchers,
): Dispatcher {
  if (isAllowlisted(url, allowlist)) return dispatchers.trusted;
  assertIpLiteralAllowed(url);
  return dispatchers.guarded;
}
