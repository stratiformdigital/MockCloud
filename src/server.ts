import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import type { ServerConfig } from './types.js';
import { createRouter } from './router.js';
import { createMockCloudConsoleMiddleware } from './mockcloud-console.js';
import { info } from './util/logger.js';
import { setBaseUrl } from './server-url.js';
import { startDynamoLocal, stopDynamoLocal } from './services/dynamodb/local.js';
import { getAllMockServices } from './services/registry.js';
import { getAllAzureServices } from './azure/registry.js';
import { startServiceBusBroker, stopServiceBusBroker } from './azure/services/service-bus/index.js';

export const PID_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/mockcloud.pid');
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
export const AZURE_CLI_CERT = path.join(DATA_DIR, 'mockcloud-azure-cli-localhost.crt');
const AZURE_CLI_KEY = path.join(DATA_DIR, 'mockcloud-azure-cli-localhost.key');
const AMPLIFY_S3_PORT = 20005;

export function stopServer(): boolean {
  if (!existsSync(PID_FILE)) {
    return false;
  }
  const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
  let stopped = false;
  try {
    process.kill(pid, 'SIGTERM');
    stopped = true;
  } catch {}
  try { unlinkSync(PID_FILE); } catch {}
  return stopped;
}

export async function startServer(config: ServerConfig): Promise<void> {
  process.on('uncaughtException', (err) => {
    info(`Uncaught exception: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  });
  process.on('unhandledRejection', (reason) => {
    info(`Unhandled rejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
  });

  mkdirSync(path.dirname(PID_FILE), { recursive: true });
  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    try {
      process.kill(pid, 0);
      throw new Error(`MockCloud is already running (PID ${pid}). Run "yarn tsx src/cli.ts stop" first.`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('MockCloud is already')) throw err;
      unlinkSync(PID_FILE);
    }
  }

  const consoleMiddleware = createMockCloudConsoleMiddleware();
  const handleRequest = createRouter(config, [consoleMiddleware]);
  const requestHandler = (protocol: 'http' | 'https') => (req: IncomingMessage, res: ServerResponse) => {
    req.headers['x-forwarded-proto'] = protocol;
    handleRequest(req, res).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      info(`Request error: ${message}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    });
  };

  setBaseUrl(`http://localhost:${config.port}`);

  const server = createHttpServer(requestHandler('http'));
  let httpsServer: ReturnType<typeof createHttpsServer> | undefined;

  const shutdown = () => {
    stopDynamoLocal();
    stopServiceBusBroker();
    info('Shutting down...');
    try { unlinkSync(PID_FILE); } catch {}
    httpsServer?.close();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await startDynamoLocal();

  return new Promise<void>((resolve) => {
    server.listen(config.port, () => {
      const serviceCount = getAllMockServices().length;
      const azureServiceCount = getAllAzureServices().length;
      info(`MockCloud Server running at http://localhost:${config.port}`);
      info(`Region: ${config.region}, ${serviceCount} AWS services, ${azureServiceCount} Azure services`);
      info(`  AWS CLI: aws --profile mockcloud <service> <command>`);

      if (config.azureHttpsPort) {
        const credentials = ensureLocalhostCertificate();
        if (credentials) {
          httpsServer = createHttpsServer(credentials, requestHandler('https'));
          httpsServer.listen(config.azureHttpsPort, () => {
            info(`Azure CLI HTTPS endpoint at https://localhost:${config.azureHttpsPort}`);
          });
        }
      }

      const s3Server = createHttpServer((req, res) => {
        handleRequest(req, res).catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          info(`S3 proxy error: ${message}`);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
          }
        });
      });
      s3Server.listen(AMPLIFY_S3_PORT, () => {
        info(`Amplify S3 endpoint at http://localhost:${AMPLIFY_S3_PORT}`);
      });

      try {
        startServiceBusBroker(config.serviceBusPort);
      } catch (err) {
        info(`Service Bus broker failed to start: ${err instanceof Error ? err.message : String(err)}`);
      }

      writeFileSync(PID_FILE, String(process.pid));
      resolve();
    });
  });
}

export function ensureLocalhostCertificate(): { key: Buffer; cert: Buffer } | null {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(AZURE_CLI_CERT) || !existsSync(AZURE_CLI_KEY)) {
    try {
      execFileSync('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        AZURE_CLI_KEY,
        '-out',
        AZURE_CLI_CERT,
        '-subj',
        '/CN=localhost',
        '-days',
        '3650',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
      ], { stdio: 'ignore' });
    } catch (err) {
      info(`Could not create localhost certificate for Azure CLI HTTPS endpoint: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  return {
    key: readFileSync(AZURE_CLI_KEY),
    cert: readFileSync(AZURE_CLI_CERT),
  };
}
