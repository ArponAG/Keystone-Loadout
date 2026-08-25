/**
 * Turning a raw request into something a human can recognise.
 *
 * Deliberately coarse. The goal is "which of my friends is this" across a handful of
 * people, not analytics: a label like "Windows - Chrome" plus a stable id does that,
 * and anything finer would be fingerprinting for its own sake.
 */

/** Private, loopback and link-local ranges. No geolocation service can place these. */
export function isPrivateIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();

  if (v === '::1' || v === '127.0.0.1' || v === 'localhost' || v === '') return true;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9')) return true;
  if (v.startsWith('fea') || v.startsWith('feb')) return true;

  const parts = v.split('.');
  if (parts.length !== 4) return false;
  const [a, b] = parts.map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;

  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  // Carrier-grade NAT, which behaves like a private range for our purposes.
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;

  return false;
}

/**
 * The client address.
 *
 * `x-forwarded-for` is a comma-separated chain appended to by each hop, so the client
 * is the FIRST entry — taking the last would give whichever proxy spoke to us. It is
 * also trivially spoofable by the client, which is fine here: this is a private
 * dashboard on a LAN box, not an access control decision.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return normaliseIp(first);
  }

  const real = headers.get('x-real-ip');
  if (real) return normaliseIp(real.trim());

  return null;
}

/** Strip the IPv6-mapped IPv4 prefix so 10.0.0.4 and ::ffff:10.0.0.4 are one address. */
function normaliseIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

/**
 * A short, readable device label from the User-Agent.
 *
 * Ordering matters throughout: Edge's UA contains "Chrome", Chrome's contains "Safari",
 * and Android's contains "Linux", so the most specific test has to run first or every
 * device reports as the most generic thing that matches.
 */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown';
  const ua = userAgent;

  const os =
    /Windows NT 10|Windows NT 11/.test(ua) ? 'Windows'
    : /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown';

  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Unknown';

  if (os === 'Unknown' && browser === 'Unknown') return 'Unknown';
  return `${os} - ${browser}`;
}

/** Flag image for an ISO country code. Null when the country is unknown. */
export function flagUrl(countryCode: string | null | undefined): string | null {
  if (!countryCode || countryCode.length !== 2) return null;
  // An image, not the flag emoji: Windows ships no flag glyphs and renders them as the
  // two letters instead, which would make the flag column useless on the machine this
  // dashboard is actually read on.
  return `https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png`;
}

/**
 * A stable, friendly name for a visitor id.
 *
 * The id is a UUID, which is unreadable and impossible to talk about. This maps it onto
 * a fixed word pair, so a person shows up as "Amber Drake" every time rather than
 * "8f14e45f-...". Derived from the id, so it needs no storage and never drifts.
 */
const ADJECTIVES = [
  'Amber', 'Azure', 'Crimson', 'Dusky', 'Ember', 'Frost', 'Gilded', 'Hollow',
  'Ivory', 'Jade', 'Lunar', 'Molten', 'Onyx', 'Pale', 'Quiet', 'Rust',
  'Silver', 'Storm', 'Umber', 'Verdant',
];

const NOUNS = [
  'Drake', 'Sentinel', 'Warden', 'Falcon', 'Golem', 'Harrier', 'Kestrel', 'Lynx',
  'Mantis', 'Nomad', 'Otter', 'Petrel', 'Raven', 'Sable', 'Tiger', 'Vulture',
];

export function visitorName(visitorId: string): string {
  // FNV-1a: tiny, dependency-free, and stable across processes — which matters, because
  // a name that changed between server restarts would defeat the point.
  let hash = 0x811c9dc5;
  for (let i = 0; i < visitorId.length; i += 1) {
    hash ^= visitorId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  const adjective = ADJECTIVES[hash % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(hash / ADJECTIVES.length) % NOUNS.length];
  return `${adjective} ${noun}`;
}
