#!/usr/bin/env node
import { Command } from 'commander';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { REGION } from './config.js';
import { startServer, stopServer } from './server.js';
import { setVerbose } from './util/logger.js';
import { clearAllState } from './state/store.js';
import type { ServerConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function run(argv: string[]): void {
  const program = new Command();

  program
    .name('mockcloud')
    .description('Local AWS replacement with mock API backends')
    .version('0.1.0');

  program
    .command('serve', { isDefault: true })
    .description('Start the MockCloud server')
    .option('--port <n>', 'Port to listen on', '4444')
    .option('--region <region>', 'AWS region to simulate', 'us-east-1')
    .option('--verbose', 'Enable verbose logging', false)
    .action(async (opts) => {
      const config: ServerConfig = {
        port: parseInt(opts.port, 10),
        region: opts.region,
        verbose: opts.verbose,
      };

      setVerbose(config.verbose);

      await startServer(config);

      const consoleDir = resolve(__dirname, '..', 'console');
      const distIndex = resolve(consoleDir, 'dist', 'index.html');
      const srcDir = resolve(consoleDir, 'src');
      const needsBuild = !existsSync(distIndex) ||
        statSync(srcDir).mtimeMs > statSync(distIndex).mtimeMs;
      if (needsBuild) {
        try {
          execSync('yarn install && yarn build', { cwd: consoleDir, stdio: 'ignore' });
        } catch {
          console.error('Console build failed. The API is running but the web console will not be available.');
        }
      }
    });

  program
    .command('clear')
    .description('Clear all persisted state')
    .action(async () => {
      await clearAllState();
      console.log('State cleared.');
    });

  program
    .command('stop')
    .description('Stop a running MockCloud server')
    .action(() => {
      if (stopServer()) {
        console.log('Stopped MockCloud server.');
      } else {
        console.log('No running server found.');
      }
    });

  program
    .command('reset')
    .description('Stop server and clear all persisted state')
    .action(async () => {
      stopServer();
      await clearAllState();
      console.log('Server stopped and state cleared.');
    });

  program
    .command('env')
    .description('Print AWS environment variables for MockCloud')
    .option('--port <n>', 'Port MockCloud listens on', '4444')
    .action((opts) => {
      const port = opts.port;
      console.log(`export AWS_ENDPOINT_URL=http://localhost:${port}`);
      console.log('export AWS_ACCESS_KEY_ID=mockcloud');
      console.log('export AWS_SECRET_ACCESS_KEY=mockcloud');
      console.log(`export AWS_DEFAULT_REGION=${REGION}`);
    });

  program
    .command('mdct <app>')
    .description('Run an MDCT application against MockCloud')
    .action(async (app: string) => {
      const { runMdctApp } = await import('./commands/mdct.js');
      await runMdctApp(app);
    });

  program.parse(argv);
}

run(process.argv);
