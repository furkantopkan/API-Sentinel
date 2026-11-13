import { describe, expect, it } from 'vitest';
import { botBlockMessage, botBlockOf } from '../../src/services/botBlock';

describe('botBlockOf', () => {
  it.each([
    [403, [['Proxy-Reason', 'blocked malicious bot']], 'proxy-reason: blocked malicious bot'],
    [403, [['cf-mitigated', 'challenge']], 'cf-mitigated: challenge'],
    [403, [['x-datadome', 'protected']], 'x-datadome'],
    [403, [['Server', 'AkamaiGHost']], 'server: AkamaiGHost'],
  ] as const)('recognises %s with %j', (status, headers, signal) => {
    expect(botBlockOf(status, headers)).toBe(signal);
  });

  it.each([
    ['a successful answer', 200, [['proxy-reason', 'blocked malicious bot']]],
    ["an API's own 403", 403, [['content-type', 'application/json']]],
    ['a proxy reason that is not about bots', 403, [['proxy-reason', 'maintenance']]],
    ['an Akamai 404', 404, [['server', 'AkamaiGHost']]],
  ] as const)('ignores %s', (_label, status, headers) => {
    expect(botBlockOf(status, headers)).toBeNull();
  });

  it('names the signal and tells the user what to do', () => {
    const message = botBlockMessage('cf-mitigated: challenge');
    expect(message).toContain('cf-mitigated: challenge');
    expect(message).toContain('Leave this step out');
  });
});
