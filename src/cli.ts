#!/usr/bin/env node
import { Command } from 'commander';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { REGION } from './config.js';
import { API_MANAGEMENT_SERVICE, APP_CONFIG_ACCOUNT, COSMOS_ACCOUNT, EVENT_GRID_TOPIC, FUNCTION_APP_NAME, KEY_VAULT_NAME, LOCATION, STORAGE_ACCOUNT, SUBSCRIPTION_ID, TENANT_ID } from './azure/config.js';
import { AZURE_CLI_CERT, ensureLocalhostCertificate, startServer, stopServer } from './server.js';
import { setVerbose } from './util/logger.js';
import { clearAllState } from './state/store.js';
import type { ServerConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

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
    .option('--azure-https-port <n>', 'HTTPS port for Azure CLI endpoints')
    .option('--service-bus-port <n>', 'AMQP port for Azure Service Bus', '5672')
    .option('--region <region>', 'AWS region to simulate', 'us-east-1')
    .option('--verbose', 'Enable verbose logging', false)
    .action(async (opts) => {
      const port = parseInt(opts.port, 10);
      const config: ServerConfig = {
        port,
        azureHttpsPort: opts.azureHttpsPort ? parseInt(opts.azureHttpsPort, 10) : port + 1,
        serviceBusPort: parseInt(opts.serviceBusPort, 10),
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
    .description('Print environment variables for MockCloud')
    .option('--port <n>', 'Port MockCloud listens on', '4444')
    .option('--azure-https-port <n>', 'HTTPS port for Azure CLI endpoints')
    .option('--azure', 'Print Azure SDK environment variables instead of AWS variables', false)
    .option('--service-bus-port <n>', 'AMQP port for Azure Service Bus', '5672')
    .action((opts) => {
      const port = opts.port;
      const azureHttpsPort = opts.azureHttpsPort ?? String(parseInt(port, 10) + 1);
      const serviceBusPort = opts.serviceBusPort;
      if (opts.azure) {
        const credentials = ensureLocalhostCertificate();
        console.log(`export AZURE_AUTHORITY_HOST=${shellQuote(`https://localhost:${azureHttpsPort}/azure/login.microsoftonline.com`)}`);
        console.log(`export AZURE_TENANT_ID=${shellQuote(TENANT_ID)}`);
        console.log(`export AZURE_CLIENT_ID=${shellQuote('mockcloud')}`);
        console.log(`export AZURE_CLIENT_SECRET=${shellQuote('mockcloud')}`);
        console.log(`export AZURE_SUBSCRIPTION_ID=${shellQuote(SUBSCRIPTION_ID)}`);
        console.log(`export AZURE_STORAGE_CONNECTION_STRING=${shellQuote(`DefaultEndpointsProtocol=http;AccountName=${STORAGE_ACCOUNT};AccountKey=bW9ja2Nsb3Vk;BlobEndpoint=http://localhost:${port}/azure/${STORAGE_ACCOUNT}.blob.core.windows.net;`)}`);
        console.log(`export AZURE_KEYVAULT_URL=${shellQuote(`http://localhost:${port}/azure/${KEY_VAULT_NAME}.vault.azure.net`)}`);
        console.log(`export AZURE_COSMOS_ENDPOINT=${shellQuote(`http://localhost:${port}/azure/${COSMOS_ACCOUNT}.documents.azure.com`)}`);
        console.log(`export AZURE_COSMOS_CONNECTION_STRING=${shellQuote(`AccountEndpoint=http://localhost:${port}/azure/${COSMOS_ACCOUNT}.documents.azure.com;AccountKey=bW9ja2Nsb3Vk;`)}`);
        console.log(`export AZURE_APPCONFIG_ENDPOINT=${shellQuote(`http://localhost:${port}/azure/${APP_CONFIG_ACCOUNT}.azconfig.io`)}`);
        console.log(`export AZURE_APPCONFIG_CONNECTION_STRING=${shellQuote(`Endpoint=http://localhost:${port}/azure/${APP_CONFIG_ACCOUNT}.azconfig.io;Id=mockconfig;Secret=bW9ja2Nsb3Vk`)}`);
        console.log(`export AZURE_FUNCTIONS_ENDPOINT=${shellQuote(`http://localhost:${port}/azure/${FUNCTION_APP_NAME}.azurewebsites.net`)}`);
        console.log(`export AZURE_EVENTGRID_ENDPOINT=${shellQuote(`http://localhost:${port}/azure/${EVENT_GRID_TOPIC}.${LOCATION}-1.eventgrid.azure.net/api/events`)}`);
        console.log(`export AZURE_EVENTGRID_KEY=${shellQuote('bW9ja2Nsb3Vk')}`);
        console.log(`export AZURE_APIM_GATEWAY_ENDPOINT=${shellQuote(`http://localhost:${port}/azure/${API_MANAGEMENT_SERVICE}.azure-api.net`)}`);
        console.log(`export AZURE_LOG_ANALYTICS_WORKSPACE=${shellQuote('mockworkspace')}`);
        console.log(`export AZURE_LOG_ANALYTICS_INGEST_ENDPOINT=${shellQuote(`http://localhost:${port}/azure/mockworkspace.ods.opinsights.azure.com/api/logs`)}`);
        console.log(`export AZURE_LOG_ANALYTICS_QUERY_ENDPOINT=${shellQuote(`http://localhost:${port}/azure/api.loganalytics.io/v1/workspaces/mockworkspace/query`)}`);
        if (credentials) {
          console.log(`export AZURE_RESOURCE_MANAGER_ENDPOINT=${shellQuote(`https://localhost:${azureHttpsPort}/azure/management.azure.com`)}`);
          console.log(`export REQUESTS_CA_BUNDLE=${shellQuote(AZURE_CLI_CERT)}`);
          console.log(`export NODE_EXTRA_CA_CERTS=${shellQuote(AZURE_CLI_CERT)}`);
        } else {
          console.error('Warning: localhost certificate could not be created. HTTPS-dependent variables (AZURE_RESOURCE_MANAGER_ENDPOINT, REQUESTS_CA_BUNDLE, NODE_EXTRA_CA_CERTS) are omitted.');
        }
        console.log(`export AZURE_SERVICE_BUS_AMQP_URI=${shellQuote(`amqp://localhost:${serviceBusPort}`)}`);
        console.log(`export AZURE_SERVICE_BUS_CONNECTION_STRING=${shellQuote(`Endpoint=sb://localhost:${serviceBusPort};SharedAccessKeyName=mockcloud;SharedAccessKey=bW9ja2Nsb3Vk;UseDevelopmentEmulator=true;`)}`);
        return;
      }
      console.log(`export AWS_ENDPOINT_URL=http://localhost:${port}`);
      console.log('export AWS_ACCESS_KEY_ID=mockcloud');
      console.log('export AWS_SECRET_ACCESS_KEY=mockcloud');
      console.log(`export AWS_DEFAULT_REGION=${REGION}`);
    });

  program
    .command('mdct <app>')
    .description('Run an MDCT application against MockCloud')
    .action(async (app: string) => {
      try {
        const { runMdctApp } = await import('./commands/mdct.js');
        await runMdctApp(app);
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  program.parse(argv);
}

run(process.argv);
