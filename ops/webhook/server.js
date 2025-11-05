const http = require('http');
const { spawn } = require('child_process');
const createHandler = require('github-webhook-handler');

// ВАЖНО: этот секрет должен совпадать с секретом в настройке вебхука GitHub
const handler = createHandler({ path: '/webhooks/github', secret: 'aE5995316_gh_deploy_2025' });

function runDeploy(res) {
  const child = spawn('/bin/bash', ['/home/app/deploy.sh'], { stdio: 'inherit' });
  child.on('close', (code) => {
    if (code === 0) { res.statusCode = 200; res.end('deploy ok\n'); }
    else { res.statusCode = 500; res.end('deploy failed\n'); }
  });
}

const server = http.createServer((req, res) => {
  handler(req, res, function () {
    res.statusCode = 404;
    res.end('no route\n');
  });
});

handler.on('error', function () {
  // молча
});

// на любой push — деплой
handler.on('push', function (event) {
  const res = event.res || event.response || event; // на всякий
  runDeploy(res);
});

server.listen(9000, '127.0.0.1', () => {
  console.log('webhook on 127.0.0.1:9000');
});
