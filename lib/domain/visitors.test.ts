/**
 * Visitor labelling.
 *
 * The User-Agent tests are the ones that matter: every major UA string deliberately
 * lies about what it is for compatibility reasons, so a naive check reports almost
 * every browser as Safari and almost every phone as Linux.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clientIp, deviceLabel, flagUrl, isPrivateIp, visitorName } from './visitors';

const UA = {
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
};

test('a browser is identified by its most specific marker, not its first', () => {
  // Edge's UA contains "Chrome", and Chrome's contains "Safari". Checking in the wrong
  // order reports every Chromium browser as Safari.
  assert.equal(deviceLabel(UA.windowsEdge), 'Windows - Edge');
  assert.equal(deviceLabel(UA.windowsChrome), 'Windows - Chrome');
  assert.equal(deviceLabel(UA.macSafari), 'macOS - Safari');
});

test('Android is not reported as Linux', () => {
  // Android UA strings begin "Linux; Android", so a Linux check that runs first
  // swallows every phone.
  assert.equal(deviceLabel(UA.androidChrome), 'Android - Chrome');
});

test('iOS is not reported as macOS', () => {
  // iPhone UAs contain "like Mac OS X" verbatim.
  assert.equal(deviceLabel(UA.iphoneSafari), 'iOS - Safari');
});

test('Firefox on Windows', () => {
  assert.equal(deviceLabel(UA.windowsFirefox), 'Windows - Firefox');
});

test('a missing or unrecognisable User-Agent degrades to Unknown', () => {
  assert.equal(deviceLabel(null), 'Unknown');
  assert.equal(deviceLabel(''), 'Unknown');
  assert.equal(deviceLabel('curl/8.4.0'), 'Unknown');
});

test('private ranges are recognised so they are never sent for geolocation', () => {
  for (const ip of ['192.168.50.94', '10.0.0.7', '172.16.4.1', '172.31.255.254', '127.0.0.1', '::1', '169.254.1.1', '100.64.0.1']) {
    assert.ok(isPrivateIp(ip), `${ip} should be private`);
  }
});

test('public addresses are not mistaken for private ones', () => {
  // 172.32 is outside the 172.16-31 block, and 100.128 is outside carrier-grade NAT.
  for (const ip of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '193.1.1.1', '100.128.0.1']) {
    assert.ok(!isPrivateIp(ip), `${ip} should be public`);
  }
});

test('the client address is the first hop, not the last', () => {
  // x-forwarded-for grows as it passes through proxies. The last entry is whichever
  // proxy spoke to us; taking it would label every visitor as the reverse proxy.
  const headers = new Headers({ 'x-forwarded-for': '203.0.113.9, 70.41.3.18, 150.172.238.178' });
  assert.equal(clientIp(headers), '203.0.113.9');
});

test('IPv6-mapped IPv4 collapses to one address', () => {
  // Otherwise ::ffff:192.168.1.5 and 192.168.1.5 are two different "people".
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '::ffff:192.168.1.5' })), '192.168.1.5');
});

test('no address headers yields null rather than a guess', () => {
  assert.equal(clientIp(new Headers()), null);
});

test('flags resolve only for real country codes', () => {
  assert.equal(flagUrl('BD'), 'https://flagcdn.com/24x18/bd.png');
  assert.equal(flagUrl('gb'), 'https://flagcdn.com/24x18/gb.png');
  assert.equal(flagUrl(null), null);
  assert.equal(flagUrl(''), null);
  assert.equal(flagUrl('XYZ'), null);
});

test('visitor names are stable and vary between ids', () => {
  const a = '8f14e45f-ceea-467a-9c2b-1f0a1b2c3d4e';
  const b = 'd41d8cd9-8f00-b204-e980-0998ecf8427e';

  assert.equal(visitorName(a), visitorName(a), 'the same id must always give the same name');
  assert.notEqual(visitorName(a), visitorName(b));
  assert.match(visitorName(a), /^[A-Z][a-z]+ [A-Z][a-z]+$/);
});

test('names spread across the available pairs rather than collapsing', () => {
  // A hash that only fed the adjective would give every visitor the same noun, and the
  // names would stop being distinguishable at a glance.
  const names = new Set(
    Array.from({ length: 200 }, (_, i) => visitorName(`visitor-${i}-0000-0000-000000000000`)),
  );
  assert.ok(names.size > 100, `expected a wide spread, got ${names.size} distinct names`);
});
