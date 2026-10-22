import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';
import {installLocalNetworkGuard} from '../lib/local-network-guard.mjs';
import {withFixtureCleanup} from './fixture-cleanup.mjs';

const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'process-network-guard-fixture-'));
const saved=[[net.Socket.prototype,'connect'],[dgram.Socket.prototype,'send'],[tls,'connect'],[dns,'lookup'],[dns.promises,'lookup'],[globalThis,'fetch']].map(([owner,key])=>({owner,key,descriptor:Object.getOwnPropertyDescriptor(owner,key)}));
const seen=[],checks=[];
await withFixtureCleanup(async () => {
  net.Socket.prototype.connect=function(...args){seen.push({kind:'tcp',receiver:this,args});return this;};
  dgram.Socket.prototype.send=function(...args){seen.push({kind:'udp',receiver:this,args});return this;};
  tls.connect=function(...args){seen.push({kind:'tls',receiver:this,args});return this;};
  dns.lookup=function(...args){seen.push({kind:'dns',receiver:this,args});return this;};
  dns.promises.lookup=async function(...args){seen.push({kind:'promise-dns',receiver:this,args});return this;};
  globalThis.fetch=(input,options)=>{seen.push({kind:'fetch',input,options});return Promise.resolve(new Response('isolated'));};
  installLocalNetworkGuard(fixture);
  const socket=new net.Socket();
  assert.equal(socket.connect(3068,'127.0.0.1'),socket);
  assert.equal(seen.at(-1).receiver,socket);
  assert.deepEqual(seen.at(-1).args,[3068,'127.0.0.1']);
  checks.push('TCP wrapper keeps actual Socket receiver, arguments and return');
  assert.equal(socket.connect({host:'::1',port:3068}),socket);
  assert.equal(socket.connect({path:'synthetic-pipe'}),socket);
  checks.push('IPv6 loopback and original local IPC branch retained');
  const udp=dgram.createSocket('udp4'),bytes=Buffer.from('isolated');
  assert.equal(udp.send(bytes,3068,'127.0.0.1'),udp);
  assert.equal(seen.at(-1).receiver,udp);
  assert.deepEqual(seen.at(-1).args,[bytes,3068,'127.0.0.1']);
  checks.push('UDP wrapper keeps actual Socket receiver, arguments and return');
  assert.equal(tls.connect({host:'localhost',port:3068}),tls);
  assert.equal(dns.lookup('localhost'),dns);
  assert.equal(await dns.promises.lookup('localhost'),dns.promises);
  checks.push('TLS/DNS delegation and explicit receivers retained');
  const response=await globalThis.fetch('http://127.0.0.1:3068/',{redirect:'follow'});
  assert.equal(await response.text(),'isolated');
  assert.equal(seen.at(-1).options.redirect,'error');
  checks.push('Fetch keeps local-only redirect refusal');
  for(const call of [()=>socket.connect(443,'outside.invalid'),()=>udp.send(bytes,443,'outside.invalid'),()=>tls.connect({host:'outside.invalid'}),()=>dns.lookup('outside.invalid'),()=>dns.promises.lookup('outside.invalid'),()=>globalThis.fetch('https://outside.invalid/')]){
    const before=seen.length;
    assert.throws(call,/Local outbound network refused/);
    assert.equal(seen.length,before,'forbidden target must never reach delegate');
  }
  checks.push('Every non-loopback protocol rejected before any delegate');
  const audit=fs.readFileSync(path.join(fixture,'.wrangler/local-only/network-audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(audit.filter(entry=>entry.allowed===false).length,6);
  assert(audit.every(entry=>entry.pid===process.pid));
  checks.push('Audit records six refusals and exact child process only');
  console.log(JSON.stringify({status:'PASS',checks,networkRequests:0,businessWrites:0,scope:'Actual production guard with Socket instances and controlled native delegates; no real network connection'}));
}, () => {
  for(const {owner,key,descriptor} of saved){assert(descriptor);Object.defineProperty(owner,key,descriptor);}
  delete globalThis[Symbol.for('process.local.network.guard')];
  const actual=fs.realpathSync(fixture),parent=fs.realpathSync(os.tmpdir());
  if(path.dirname(actual)!==parent||!path.basename(actual).startsWith('process-network-guard-fixture-'))throw Error('Fixture boundary invalid');
  fs.rmSync(actual,{recursive:true,force:true});
});
