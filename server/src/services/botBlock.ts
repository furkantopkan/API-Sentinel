/**
 * Recognises an answer from a site's bot protection rather than from the site
 * itself. Such sites let real browsers in but refuse test tools, whatever
 * headers are sent (they look at how the connection is made). API Sentinel does
 * not try to get around this; it only says so clearly, instead of reporting a
 * failed "status equals 200" as if the site were broken.
 *
 * Only signals that bot protection products add on purpose are used, so an
 * API's own 403 (e.g. a missing token) is never mistaken for one.
 */
export function botBlockOf(
  status: number,
  headers: readonly (readonly [string, string])[],
): string | null {
  if (status < 400) return null;
  const header = (name: string) => headers.find(([key]) => key.toLowerCase() === name)?.[1].trim();

  const proxyReason = header('proxy-reason');
  if (proxyReason !== undefined && /bot/i.test(proxyReason)) return `proxy-reason: ${proxyReason}`;
  const cloudflare = header('cf-mitigated');
  if (cloudflare !== undefined) return `cf-mitigated: ${cloudflare}`;
  if (header('x-datadome') !== undefined) return 'x-datadome';
  const server = header('server');
  if (status === 403 && server !== undefined && /akamaighost/i.test(server))
    return `server: ${server}`;
  return null;
}

export function botBlockMessage(signal: string): string {
  return (
    `The site's bot protection refused this request (${signal}). ` +
    'It lets real browsers in but not test tools, so this step cannot run here; ' +
    'API Sentinel does not try to get around it. Leave this step out of the collection.'
  );
}
