import { execSync, spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { debug, info } from '../../util/logger.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const JAR_DIR = path.resolve(__dir, '../../../data/dynamodb-local');
const JAR_PATH = path.join(JAR_DIR, 'DynamoDBLocal.jar');
const DB_PATH = path.resolve(__dir, '../../../data/state');
const DOWNLOAD_URL = 'https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_latest.tar.gz';

let proc: ChildProcess | null = null;
let port = 0;

async function download(): Promise<void> {
  info('Downloading DynamoDB Local...');
  fs.mkdirSync(JAR_DIR, { recursive: true });
  const tmpFile = path.join(JAR_DIR, 'dynamodb_local_latest.tar.gz');
  const response = await fetch(DOWNLOAD_URL);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(tmpFile, buffer);
  execSync(`tar xzf ${tmpFile}`, { cwd: JAR_DIR });
  fs.unlinkSync(tmpFile);
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const addr = server.address() as net.AddressInfo;
      const p = addr.port;
      server.close((err) => (err ? reject(err) : resolve(p)));
    });
    server.on('error', reject);
  });
}

async function waitForReady(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://localhost:${port}`, {
        method: 'POST',
        headers: {
          'X-Amz-Target': 'DynamoDB_20120810.ListTables',
          'Content-Type': 'application/x-amz-json-1.0',
        },
        body: '{}',
      });
      info(`DynamoDB Local ready on port ${port}`);
      return;
    } catch {
      debug('DynamoDB Local not ready yet, retrying...');
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (proc) proc.kill('SIGTERM');
  proc = null;
  port = 0;
  throw new Error('DynamoDB Local failed to start within 9 seconds');
}

export async function startDynamoLocal(): Promise<void> {
  info('Starting DynamoDB Local...');

  if (!fs.existsSync(JAR_PATH)) {
    await download();
  }

  try {
    execSync('java -version', { stdio: 'ignore' });
  } catch {
    throw new Error('DynamoDB Local requires Java. Install a JRE (Java 11+) and try again.');
  }

  port = await findFreePort();

  proc = spawn('java', ['--enable-native-access=ALL-UNNAMED', '-jar', 'DynamoDBLocal.jar', '-port', String(port), '-sharedDb', '-dbPath', DB_PATH], {
    cwd: JAR_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout!.resume();
  proc.stderr!.resume();

  proc.on('exit', (code, signal) => {
    if (proc) {
      info(`DynamoDB Local exited unexpectedly (code=${code}, signal=${signal})`);
    }
  });

  await waitForReady();
}

export function stopDynamoLocal(): void {
  if (proc) {
    proc.kill('SIGTERM');
    proc = null;
    port = 0;
  }
}

export function getDynamoLocalPort(): number {
  if (!port) throw new Error('DynamoDB Local is not started');
  return port;
}
