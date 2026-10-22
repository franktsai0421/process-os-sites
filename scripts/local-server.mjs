import {acquireLocalStorageLease} from '../lib/local-storage-lease.mjs';
import {createServer as createViteServer} from 'vite';
import {assertLocalMode,configureOfflineLocal,localFailureMessage}from'../lib/local-runtime.mjs';
import{installLocalNetworkGuard}from'../lib/local-network-guard.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
let server, storageLease, opening = false, closing;
async function closeLocalServer() {
  if (server) {
    if (!closing) {
      const close = server.close.bind(server);
      closing = Promise.resolve().then(close).then(value => {
        storageLease?.release();
        return value;
      }).catch(error => {
        process.exitCode = 1;
        throw error;
      });
      server.close = () => closing;
    }
    await closing;
  } else if (!opening) storageLease?.release();
}
let terminalShutdown, terminalEmit, originalTerminalEmit;
function beginTerminalShutdown(signalRequest) {
  if (terminalShutdown) return terminalShutdown;
  const originalExit = Object.getOwnPropertyDescriptor(process, 'exit').value;
  let firstExit;
  const deferredExit = function deferOwnedTerminalExit(...args) {
    firstExit ??= {receiver: this, args};
  };
  process.exit = deferredExit;
  terminalShutdown = closeLocalServer().then(() => {
    if (process.emit !== terminalEmit || process.exit !== deferredExit) {
      throw Error('Terminal shutdown wrapper ownership changed');
    }
    if (signalRequest) Reflect.apply(originalTerminalEmit, signalRequest.receiver, signalRequest.args);
    if (process.emit !== terminalEmit || process.exit !== deferredExit) {
      throw Error('Terminal shutdown wrapper ownership changed');
    }
    process.emit = originalTerminalEmit;
    process.exit = originalExit;
    const request = firstExit ?? {receiver: process, args: []};
    return Reflect.apply(originalExit, request.receiver, request.args);
  });
  // Report rejection without converting the shared shutdown promise into success.
  // Failed closure keeps the lease and gates; the owner can observe the failure.
  terminalShutdown.catch(error => {
    process.exitCode = 1;
    console.error(localFailureMessage(error));
  });
  return terminalShutdown;
}
function installTerminalSignalGate() {
  if (terminalEmit) throw Error('Terminal signal gate already installed');
  originalTerminalEmit = Reflect.get(process, 'emit');
  terminalEmit = function serializeOwnedTerminalSignal(signal, ...args) {
    if (this !== process || (signal !== 'SIGINT' && signal !== 'SIGTERM')) {
      return Reflect.apply(originalTerminalEmit, this, [signal, ...args]);
    }
    const hadListeners = process.listenerCount(signal) > 0;
    if (!terminalShutdown) void beginTerminalShutdown({receiver: this, args: [signal, ...args]});
    return hadListeners;
  };
  process.emit = terminalEmit;
}

try{const args=process.argv.slice(2);assertLocalMode(args);storageLease=acquireLocalStorageLease(process.cwd());configureOfflineLocal(process.cwd());installLocalNetworkGuard(process.cwd());const portIndex=args.indexOf('--port'),port=portIndex<0?3000:Number(args[portIndex+1]);opening=true;server=await createViteServer({server:{host:'127.0.0.1',port,strictPort:true,hmr:false}});if(!server.httpServer)throw Error('Local HTTP server unavailable');
  // Public ViteDevServer.httpServer uses Vite's own initialization wrapper.
  // Direct loopback listen avoids Vite 8's wildcard-address port probes.
  await new Promise((resolve,reject)=>{server.httpServer.once('error',reject);server.httpServer.once('listening',resolve);Promise.resolve(server.httpServer.listen(port,'127.0.0.1')).catch(reject);});
  const address=server.httpServer.address();console.log(`Local: http://127.0.0.1:${address.port}/`);
  if(address.port!==3000){const root=fs.realpathSync(process.cwd()),config=fs.realpathSync(path.join(root,'.wrangler/local-only/wrangler.json')),state=fs.realpathSync(path.join(root,'.wrangler/state')),serverFile=path.join(root,'scripts/local-server.mjs'),sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');fs.writeFileSync(path.join(root,'.wrangler/local-only/test-runtime.json'),JSON.stringify({pid:process.pid,port:address.port,root,config,state,configSha256:sha(config),serverSha256:sha(serverFile),startedAt:new Date().toISOString()}));}
  for(const signal of['SIGINT','SIGTERM'])process.prependListener(signal,()=>{void beginTerminalShutdown();});
  installTerminalSignalGate();
}catch(error){await closeLocalServer();console.error(localFailureMessage(error));process.exitCode=1;}
