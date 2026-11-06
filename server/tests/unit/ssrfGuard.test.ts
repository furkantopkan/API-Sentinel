import type { LookupAddress } from 'node:dns';
import { describe, expect, it } from 'vitest';
import {
  assertIpLiteralAllowed,
  BlockedTargetError,
  guardedLookup,
  isAllowlisted,
  isBlockedAddress,
} from '../../src/services/request-engine/ssrfGuard';

// Boundary-value testing: for each blocked range we check addresses at its
// edges AND the neighbours just outside it.

describe('isBlockedAddress – IPv4', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.0',
    '10.255.255.255',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254', // cloud metadata
    '172.16.0.0',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.1',
    '192.168.0.1',
    '192.168.255.255',
    '198.18.0.1',
    '198.19.255.255',
    '224.0.0.1',
    '255.255.255.255',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    '1.1.1.1',
    '8.8.8.8',
    '9.255.255.255', // just below 10/8
    '11.0.0.0', // just above 10/8
    '100.63.255.255', // just below 100.64/10
    '100.128.0.0', // just above 100.64/10
    '172.15.255.255', // just below 172.16/12
    '172.32.0.0', // just above 172.16/12
    '192.167.255.255',
    '192.169.0.0',
    '223.255.255.255', // just below multicast
  ])('allows public address %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('isBlockedAddress – IPv6', () => {
  it.each([
    '::',
    '::1',
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:169.254.169.254', // IPv4-mapped metadata
    '::ffff:7f00:1', // same as ::ffff:127.0.0.1, hex form
    '64:ff9b::7f00:1', // NAT64
    '2002:7f00:1::', // 6to4
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'fe80::1%eth0', // with zone id
    'ff02::1',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8'])(
    'allows public address %s',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    },
  );
});

describe('isBlockedAddress – fail closed', () => {
  it.each(['', 'localhost', 'not-an-ip', '999.1.1.1'])('blocks non-IP input %j', (value) => {
    expect(isBlockedAddress(value)).toBe(true);
  });
});

describe('assertIpLiteralAllowed', () => {
  // The URL parser normalises tricky spellings to a plain IP; all must be caught.
  it.each([
    'http://127.0.0.1/',
    'http://2130706433/', // decimal 127.0.0.1
    'http://0x7f.1/', // hex + short form
    'http://0177.0.0.1/', // octal
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/latest/meta-data/',
  ])('throws BlockedTargetError for %s', (raw) => {
    expect(() => assertIpLiteralAllowed(new URL(raw))).toThrow(BlockedTargetError);
  });

  it('accepts a public IP literal', () => {
    expect(() => assertIpLiteralAllowed(new URL('http://8.8.8.8/'))).not.toThrow();
  });

  it('ignores host names (they are checked after DNS)', () => {
    expect(() => assertIpLiteralAllowed(new URL('http://localhost/'))).not.toThrow();
  });
});

describe('isAllowlisted', () => {
  const allowlist = new Set(['localhost:4010', '127.0.0.1:80']);

  it('matches the exact host:port pair', () => {
    expect(isAllowlisted(new URL('http://localhost:4010/json'), allowlist)).toBe(true);
  });

  it('is case-insensitive for the host', () => {
    expect(isAllowlisted(new URL('http://LOCALHOST:4010/'), allowlist)).toBe(true);
  });

  it('uses the default port when the URL has none', () => {
    expect(isAllowlisted(new URL('http://127.0.0.1/'), allowlist)).toBe(true);
    expect(isAllowlisted(new URL('https://127.0.0.1/'), allowlist)).toBe(false); // port 443
  });

  it('does not open other ports of the same host', () => {
    expect(isAllowlisted(new URL('http://localhost:3001/'), allowlist)).toBe(false);
  });

  it('does not treat another name for the same machine as allowed', () => {
    expect(isAllowlisted(new URL('http://127.0.0.1:4010/'), allowlist)).toBe(false);
  });
});

function lookupAll(hostname: string): Promise<{ error: Error | null; address: unknown }> {
  return new Promise((resolve) => {
    guardedLookup(hostname, { all: true }, (error, address) => resolve({ error, address }));
  });
}

describe('guardedLookup (DNS-time check)', () => {
  // "localhost" resolves locally, without internet access.
  it('refuses a host name that resolves to a loopback address', async () => {
    const { error } = await lookupAll('localhost');

    expect(error).toBeInstanceOf(BlockedTargetError);
    expect((error as BlockedTargetError).hostname).toBe('localhost');
  });

  it('returns the address list when every address is public', async () => {
    // dns.lookup "resolves" an IP literal itself, without a network call.
    const { error, address } = await lookupAll('8.8.8.8');

    expect(error).toBeNull();
    expect((address as LookupAddress[])[0]?.address).toBe('8.8.8.8');
  });

  it('answers in single-address format when "all" is not requested', async () => {
    const result = await new Promise<{ address: unknown; family: unknown }>((resolve) => {
      guardedLookup('8.8.8.8', {}, (_error, address, family) => resolve({ address, family }));
    });

    expect(result).toEqual({ address: '8.8.8.8', family: 4 });
  });

  it('refuses an IPv4 literal in a private range as well', async () => {
    const { error } = await lookupAll('10.1.2.3');

    expect(error).toBeInstanceOf(BlockedTargetError);
  });
});
