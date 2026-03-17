import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerConfig } from './types.js';
import { createRouter } from './router.js';
import { createMockCloudConsoleMiddleware } from './mockcloud-console.js';
import { info } from './util/logger.js';
import { setBaseUrl } from './server-url.js';
import { startDynamoLocal, stopDynamoLocal } from './services/dynamodb/local.js';
import { getAllMockServices } from './services/registry.js';

export const PID_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/mockcloud.pid');

export async function startServer(config: ServerConfig): Promise<void> {
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

  setBaseUrl(`http://localhost:${config.port}`);

  const server = createServer(
    (req, res) => {
      handleRequest(req, res).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        info(`Request error: ${message}`);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      });
    },
  );

  const shutdown = () => {
    stopDynamoLocal();
    info('Shutting down...');
    try { unlinkSync(PID_FILE); } catch {}
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return new Promise<void>((resolve) => {
    server.listen(config.port, async () => {
      const serviceCount = getAllMockServices().length;
      info(`MockCloud Server running at http://localhost:${config.port}`);
      info(`Region: ${config.region}, ${serviceCount} services`);
      info(`  AWS CLI: aws --profile mockcloud <service> <command>`);
      writeFileSync(PID_FILE, String(process.pid));
      resolve();
      await startDynamoLocal();
    });
  });
}
