const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');

const root = __dirname;
const SERVER_PORT = 3001;
const BROWSER_URL = 'http://localhost:5173';

function run(label, cmd, args, cwd) {
  const proc = spawn(cmd, args, { cwd, stdio: 'pipe', shell: true });
  proc.stdout.on('data', d => process.stdout.write(`[${label}] ${d}`));
  proc.stderr.on('data', d => process.stderr.write(`[${label}] ${d}`));
  proc.on('exit', code => {
    console.log(`[${label}] kapandı (kod: ${code})`);
    process.exit(code || 0);
  });
  return proc;
}


const server = run('SERVER', 'node', ['index.js'], path.join(root, 'server'));

// Server hazır olduktan sonra Client'ı başlat — böylece proxy başlar başlamaz çalışır
function startClientWhenReady(maxWaitMs = 30000) {
  const start = Date.now();
  const check = () => {
    http.get(`http://localhost:${SERVER_PORT}/api/auth/me`, () => {
      console.log('[LAUNCHER] Sunucu hazır, client başlatılıyor...');
      run('CLIENT', 'npm', ['run', 'dev'], path.join(root, 'client'));
      setTimeout(() => exec(`start ${BROWSER_URL}`), 3500);
    }).on('error', () => {
      if (Date.now() - start < maxWaitMs) {
        setTimeout(check, 500);
      } else {
        console.log('[LAUNCHER] Zaman aşımı, client başlatılıyor...');
        run('CLIENT', 'npm', ['run', 'dev'], path.join(root, 'client'));
        setTimeout(() => exec(`start ${BROWSER_URL}`), 3500);
      }
    });
  };
  setTimeout(check, 2000);
}

startClientWhenReady();

process.on('SIGINT', () => { process.exit(); });
process.on('SIGTERM', () => { process.exit(); });
