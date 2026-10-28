import { spawn, execSync } from 'node:child_process';
import net from 'node:net';
process.loadEnvFile('.env');

function waitForPort(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const attempt = () => {
      const socket = net.connect(port, host);
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started > 60000) {
          reject(new Error(`PostgreSQL did not accept connections on ${port}`));
          return;
        }
        setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

execSync('docker compose up -d', { stdio: 'inherit' });
await waitForPort(5432);
execSync('npm run prisma:deploy -w api', { stdio: 'inherit' });
execSync('npm run prisma:seed -w api', { stdio: 'inherit' });

// One command string: with shell: true, Node joins separate args without quoting them.
const child = spawn(
  'npm exec -- concurrently -n api,web "npm run dev -w api" "npm run dev -w web"',
  { stdio: 'inherit', shell: true },
);

child.on('exit', (code) => process.exit(code ?? 0));
