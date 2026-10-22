import fs from 'node:fs';
import path from 'node:path';
import {localPaths, LocalSetupError} from './local-runtime.mjs';

// Local opt-in only. Production configuration does not read this file.
export function readLocalFeatures(root) {
  const file = path.join(localPaths(root).directory, 'features.json');
  if (!fs.existsSync(file)) return {webFeedback: false, sessionRevocation: false};
  if (fs.lstatSync(file).isSymbolicLink()) throw new LocalSetupError('Linked feature settings refused');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['webFeedback', 'sessionRevocation'].includes(k)) ||
      Object.values(value).some(v => typeof v !== 'boolean')) throw new LocalSetupError('Invalid Local feature settings');
  return {webFeedback: value.webFeedback === true, sessionRevocation: value.sessionRevocation === true};
}

export function localFeaturesPlugin(root, features) {
  return {name: 'process-local-features', apply: 'serve', configureServer(server) {
    if (!features.webFeedback) return;
    server.middlewares.use((request, response, next) => {
      if (!['GET', 'HEAD'].includes(request.method) || !['/process/', '/process/index.html'].includes((request.url || '').split('?')[0])) return next();
      const html = fs.readFileSync(path.join(root, 'public/process/index.html'), 'utf8')
        .replace('</body>', '<script defer src="/process/web-feedback-loader.js"></script></body>');
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.end(request.method === 'HEAD' ? '' : html);
    });
  }};
}
