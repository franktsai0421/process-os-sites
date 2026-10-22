import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';

const installed = Symbol.for('process.local.network.guard');
export function installLocalNetworkGuard(root) {
  if (globalThis[installed]) return;
  globalThis[installed] = true;
  const directory = path.join(fs.realpathSync(root), '.wrangler', 'local-only');
  fs.mkdirSync(directory, { recursive: true });
  const loopback = host => ['localhost', '127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1'].includes(String(host));
  function check(host, port, protocol) {
    host ||= 'localhost';
    const allowed = loopback(host);
    fs.appendFileSync(path.join(directory, 'network-audit.jsonl'), JSON.stringify({
      at: new Date().toISOString(), pid: process.pid, allowed,
      hostname: /^[a-zA-Z0-9._:[\]-]+$/.test(String(host)) ? String(host) : '[redacted invalid host]',
      port: Number.isInteger(Number(port)) ? Number(port) : null, protocol,
    }) + '\n');
    if (!allowed) throw new Error('Local outbound network refused; no secret details recorded');
  }
  const fetch = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    check(url.hostname, url.port || (url.protocol === 'https:' ? 443 : 80), url.protocol.slice(0, -1));
    return fetch(input, { ...options, redirect: 'error' });
  };
  // Snapshot borrowed callables without binding; keep dynamic apply lookup and caller receiver.
  const connect = Reflect.get(net.Socket.prototype, 'connect');
  net.Socket.prototype.connect = function (...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    if (options && typeof options === 'object') {
      if (!options.path) check(options.host, options.port, 'tcp');
    } else if (typeof options === 'number' || /^\d+$/.test(String(options)))
      check(typeof args[1] === 'string' ? args[1] : 'localhost', options, 'tcp');
    return connect.apply(this, args);
  };
  const tlsConnect = tls.connect;
  tls.connect = function (...args) {
    const options = args.find(value => value && typeof value === 'object') || {};
    check(options.host || (typeof args[1] === 'string' ? args[1] : 'localhost'), options.port || args[0] || 443, 'tls');
    return tlsConnect.apply(this, args);
  };
  const lookup = dns.lookup;
  dns.lookup = function (hostname, ...args) { check(hostname, null, 'dns'); return lookup.call(this, hostname, ...args); };
  const promiseLookup = dns.promises.lookup;
  dns.promises.lookup = function (hostname, ...args) { check(hostname, null, 'dns'); return promiseLookup.call(this, hostname, ...args); };
  const send = Reflect.get(dgram.Socket.prototype, 'send');
  dgram.Socket.prototype.send = function (...args) {
    const addresses = args.filter(value => typeof value === 'string');
    check(addresses.at(-1) || 'unknown', args.filter(value => typeof value === 'number').at(-1), 'udp');
    return send.apply(this, args);
  };
}
