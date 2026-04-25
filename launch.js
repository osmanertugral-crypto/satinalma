const { spawn, exec } = require('child_process');
const path = require('path');

const root = __dirname;

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
const client = run('CLIENT', 'npm', ['run', 'dev'], path.join(root, 'client'));

setTimeout(() => exec('start http://localhost:5173'), 6000);

process.on('SIGINT', () => { server.kill(); client.kill(); process.exit(); });
process.on('SIGTERM', () => { server.kill(); client.kill(); process.exit(); });
