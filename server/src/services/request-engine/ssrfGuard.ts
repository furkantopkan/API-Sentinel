import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { BlockList, isIP } from 'node:net';

/**
 * SSRF (Server-Side Request Forgery) protection.
 *
 * Our backend sends requests to URLs chosen by the user. Without protection an
 * attacker could make it call internal services (http://127.0.0.1:6379),
 * the private network (http://192.168.1.1) or cloud metadata endpoints
 * (http://169.254.169.254) that are unreachable from the outside.
 *
 * Defence in two places (see docs/architecture.md §7):
 *  1. assertIpLiteralAllowed – before sending, for URLs that contain an IP.
 *     (Node does not run a DNS lookup for IP literals, so check 2 never sees them.)
 *  2. guardedLookup – during connect, on the IP addresses DNS actually returned.
 *     Checking at connect time (not just before) defeats DNS rebinding, where a
 *     host name resolves to a public IP first and to a private IP later.
 * Redirects are followed manually and every hop goes through both checks again.
 */

// [network address, prefix length]
const BLOCKED_IPV4_RANGES: readonly [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation (TEST-NET-1)
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation (TEST-NET-2)
  ['203.0.113.0', 24], // documentation (TEST-NET-3)
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. broadcast 255.255.255.255
];

const BLOCKED_IPV6_RANGES: readonly [string, number][] = [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64: embeds an IPv4 address
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard
  ['2001::', 32], // Teredo tunnelling
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4: embeds an IPv4 address
  ['fc00::', 7], // unique local (private)
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
];
// IPv4-mapped IPv6 addresses (::ffff:127.0.0.1) need no extra entry:
// BlockList checks them against the IPv4 ranges above.

const blockList = new BlockList();
for (const [network, prefix] of BLOCKED_IPV4_RANGES) blockList.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of BLOCKED_IPV6_RANGES) blockList.addSubnet(network, prefix, 'ipv6');

/** True if the IP address is in a blocked range. Anything that is not an IP is blocked too. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.split('%')[0] ?? ''; // drop an IPv6 zone id like "fe80::1%eth0"
  const family = isIP(ip);
  if (family === 4) return blockList.check(ip, 'ipv4');
  if (family === 6) return blockList.check(ip, 'ipv6');
  return true; // fail closed
}

/** Thrown when a target resolves to (or is) a blocked address. */
export class BlockedTargetError extends Error {
  readonly code = 'ERR_SSRF_BLOCKED';
  readonly hostname: string;
  readonly address: string;

  constructor(hostname: string, address: string) {
    super(`Blocked request to ${hostname} (${address})`);
    this.name = 'BlockedTargetError';
    this.hostname = hostname;
    this.address = address;
  }
}

/** URL.hostname wraps IPv6 literals in brackets: "[::1]" → "::1". */
function stripBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function effectivePort(url: URL): string {
  return url.port || (url.protocol === 'https:' ? '443' : '80');
}

/**
 * The allowlist holds explicit `host:port` pairs from SSRF_ALLOWLIST.
 * Only that exact pair is trusted — `localhost:4010` does NOT open `localhost:3001`.
 */
export function isAllowlisted(url: URL, allowlist: ReadonlySet<string>): boolean {
  return allowlist.has(`${url.hostname.toLowerCase()}:${effectivePort(url)}`);
}

/** Check 1: URLs that already contain an IP address. */
export function assertIpLiteralAllowed(url: URL): void {
  const host = stripBrackets(url.hostname);
  if (isIP(host) !== 0 && isBlockedAddress(host)) {
    throw new BlockedTargetError(url.hostname, host);
  }
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * Check 2: a drop-in replacement for dns.lookup that the HTTP client calls
 * while connecting. It resolves ALL addresses and refuses the connection if
 * any of them is blocked (the client may try several of them).
 */
export function guardedLookup(
  hostname: string,
  options: LookupOptions,
  callback: LookupCallback,
): void {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, []);
      return;
    }
    const blocked = addresses.find((entry) => isBlockedAddress(entry.address));
    if (blocked) {
      callback(new BlockedTargetError(hostname, blocked.address), []);
      return;
    }
    const first = addresses[0];
    if (!first) {
      const notFound: NodeJS.ErrnoException = new Error(`No addresses found for ${hostname}`);
      notFound.code = 'ENOTFOUND';
      callback(notFound, []);
      return;
    }
    // Answer in the format the caller asked for.
    if (options.all) callback(null, addresses);
    else callback(null, first.address, first.family);
  });
}
