import fs from 'node:fs';
import path from 'node:path';
import {
  createBackup,
  deleteBackup,
  inspectBackup,
  listBackups,
  loadSettings,
  restoreBackup,
  runScheduler,
  saveSettings,
  startScheduler,
  verifyAdminRole,
  chooseBackupDirectory,
} from './local-backup.mjs';

const send = (res, status, value) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
};
const body = (req) =>
  new Promise((resolve, reject) => {
    let value = '';
    req.on('data', (chunk) => {
      value += chunk;
      if (value.length > 1024 * 1024) reject(Error('請求內容過大'));
    });
    req.on('end', () => {
      try {
        resolve(value ? JSON.parse(value) : {});
      } catch {
        reject(Error('JSON 格式錯誤'));
      }
    });
    req.on('error', reject);
  });
const credentials = (req) => ({
  actor: String(req.headers['x-process-admin-id'] || ''),
  password: String(req.headers['x-process-admin-password'] || ''),
});
export function localBackupPlugin(projectRoot) {
  return {
    name: 'process-control-local-backup',
    configureServer(server) {
      const stop = startScheduler(projectRoot);
      server.httpServer?.once('close', stop);
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(
          req.url || '/',
          `http://${req.headers.host || 'localhost'}`,
        );
        if (url.pathname !== '/__local-backups') return next();
        if ((req.headers.origin && req.headers.origin !== url.origin) || req.headers['sec-fetch-site']==='cross-site')
          return send(res,403,{error:'跨來源備份請求已阻擋'});
        const host = url.hostname;
        if (
          !['localhost', '127.0.0.1'].includes(host) ||
          url.searchParams.get('manage') !== '1'
        )
          return send(res, 403, { error: '本機備份服務只接受管理檢查網址' });
        const auth = credentials(req);
        if (!verifyAdminRole(projectRoot, auth.actor))
          return send(res, 403, { error: '只有最高 ADMIN 可以使用主機備份' });
        try {
          if (req.method === 'GET' && url.searchParams.get('download')) {
            const settings = loadSettings(projectRoot),
              file = path.join(
                settings.backupPath,
                path.basename(url.searchParams.get('download')),
              );
            inspectBackup(projectRoot, path.basename(file));
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader(
              'Content-Disposition',
              `attachment; filename="${path.basename(file)}"`,
            );
            return fs.createReadStream(file).pipe(res);
          }
          if (req.method === 'GET')
            return send(res, 200, listBackups(projectRoot));
          if (req.method !== 'POST')
            return send(res, 405, { error: '方法不允許' });
          const input = await body(req),
            sourceIp = req.socket.remoteAddress || 'local';
          if (input.action === 'choose-directory')
            return send(res, 200, await chooseBackupDirectory(projectRoot));
          if (input.action === 'create')
            return send(
              res,
              200,
              createBackup(projectRoot, { actor: auth.actor, sourceIp }),
            );
          if (input.action === 'scan')
            return send(res, 200, listBackups(projectRoot));
          if (input.action === 'inspect')
            return send(res, 200, inspectBackup(projectRoot, input.fileName));
          if (input.action === 'settings')
            return send(res, 200, {
              settings: saveSettings(projectRoot, input.settings, { createDirectory: true }),
            });
          if (input.action === 'delete')
            return send(
              res,
              200,
              deleteBackup(projectRoot, {
                fileName: input.fileName,
                actor: auth.actor,
                password: auth.password,
                confirmText: input.confirmText,
                sourceIp,
              }),
            );
          if (input.action === 'restore')
            return send(
              res,
              200,
              restoreBackup(projectRoot, {
                fileName: input.fileName,
                actor: auth.actor,
                password: auth.password,
                confirmText: input.confirmText,
                sourceIp,
              }),
            );
          if (input.action === 'scheduler-check')
            return send(
              res,
              200,
              runScheduler(projectRoot, new Date(input.now || Date.now())),
            );
          return send(res, 400, { error: '未知操作' });
        } catch (error) {
          return send(res, 400, { error: String(error.message || error) });
        }
      });
    },
  };
}
