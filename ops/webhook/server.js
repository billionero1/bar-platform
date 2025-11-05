const http = require('http');
const { spawn } = require('child_process');
const createHandler = require('github-webhook-handler');

// СЕКРЕТ: берём из env, иначе — твой старый
const SECRET = process.env.WEBHOOK_SECRET || 'aE5995316_gh_deploy_2025';

// Совпадает с nginx-прокси и настройкой GitHub
const handler = createHandler({ path: '/webhooks/github', secret: SECRET });

// Запускаем деплой (в фоне), не блокируя ответ GitHub
function runDeploy(tag = 'push') {
  console.log(`[webhook] deploy start (${tag})`);
  const child = spawn('/bin/bash', ['/home/app/deploy.sh'], { stdio: 'inherit' });
  child.on('close', (code) => {
    console.log(`[webhook] deploy finished (${tag}) code=${code}`);
  });
}

// HTTP-сервер: handler сам отдаёт 200/401/… и вызывает callback только если путь не совпал
const server = http.createServer((req, res) => {
  handler(req, res, function () {
    res.statusCode = 404;
    res.end('no route\n');
  });
});

// Раньше было «молча» — оставим поведение тем же (не шумим в логах)
handler.on('error', function () { /* silent */ });

// На любой push — деплой (как у тебя и было)
handler.on('push', function (event) {
  const repo = event.payload && event.payload.repository && event.payload.repository.full_name;
  const ref  = event.payload && event.payload.ref;
  runDeploy(`push:${repo || 'unknown'}@${ref || 'unknown'}`);
});

// Логи старта и корректное завершение под systemd
server.on('listening', () => {
  const addr = server.address();
  console.log(`[webhook] listening on ${addr.address}:${addr.port}`);
});

server.on('error', (err) => {
  console.error('[webhook] server error:', err);
  // Пусть systemd нас перезапустит (и ExecStartPre очистит порт)
  process.exit(1);
});

server.listen(9000, '127.0.0.1');
