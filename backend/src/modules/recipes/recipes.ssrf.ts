import { lookup } from 'dns/promises';
import net from 'net';
import { httpError } from './recipes.types';

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;
const MAX_BODY = 1_000_000;
const UA = 'VitaScanRecipeBot/1.0';

function ipBlocked(ip: string): boolean {
  const n = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (n === '::1' || n === '0.0.0.0') return true;
  if (n.startsWith('127.') || n.startsWith('10.') || n.startsWith('169.254.')) return true;
  if (n.startsWith('192.168.')) return true;
  const m = n.match(/^172\.(\d+)\./);
  if (m) {
    const oct = Number(m[1]);
    if (oct >= 16 && oct <= 31) return true;
  }
  if (n === '169.254.169.254') return true;
  if (n.startsWith('fc') || n.startsWith('fd') || n.startsWith('fe80')) return true;
  return false;
}

export function parsePublicHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw httpError(400, 'Érvénytelen URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw httpError(400, 'Csak http/https URL engedélyezett.');
  }
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '0.0.0.0') {
    throw httpError(400, 'Belső hálózati cím nem engedélyezett.');
  }
  if (net.isIP(host) && ipBlocked(host)) {
    throw httpError(400, 'Privát IP-cím nem engedélyezett.');
  }
  return u;
}

async function assertResolvedPublic(hostname: string) {
  if (net.isIP(hostname)) {
    if (ipBlocked(hostname)) throw httpError(400, 'Privát IP-cím nem engedélyezett.');
    return;
  }
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length) throw httpError(400, 'A domain nem feloldható.');
  for (const rec of records) {
    if (ipBlocked(rec.address)) throw httpError(400, 'A domain privát címre mutat.');
  }
}

export async function ssrfFetch(rawUrl: string): Promise<{ url: string; contentType: string; body: Buffer }> {
  let current = parsePublicHttpUrl(rawUrl).toString();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const parsed = parsePublicHttpUrl(current);
    await assertResolvedPublic(parsed.hostname);
    const res = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json,*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw httpError(400, 'Érvénytelen átirányítás.');
      current = new URL(loc, parsed).toString();
      continue;
    }
    if (!res.ok) throw httpError(502, `A forrásoldal nem olvasható (HTTP ${res.status}).`);
    const len = Number(res.headers.get('content-length') || '0');
    if (len > MAX_BODY) throw httpError(413, 'A forrásoldal túl nagy.');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BODY) throw httpError(413, 'A forrásoldal túl nagy.');
    return {
      url: parsed.toString(),
      contentType: res.headers.get('content-type') || '',
      body: buf,
    };
  }
  throw httpError(400, 'Túl sok átirányítás.');
}

export function stripTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    const drop = ['fbclid', 'gclid', 'igshid', 'si', 'feature', 'pp'];
    for (const key of [...u.searchParams.keys()]) {
      if (drop.includes(key) || key.startsWith('utm_')) u.searchParams.delete(key);
    }
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}
