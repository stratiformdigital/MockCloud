import type { AccessToken, TokenCredential } from '@azure/core-auth';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { SecretClient } from '@azure/keyvault-secrets';
import { KeyClient } from '@azure/keyvault-keys';
import { ResourceManagementClient } from '@azure/arm-resources';
import { CosmosClient } from '@azure/cosmos';
import { AppConfigurationClient } from '@azure/app-configuration';
import { AzureKeyCredential, EventGridPublisherClient } from '@azure/eventgrid';
import { getTestEndpoint } from './client-factory.js';

export const AZURE_SUBSCRIPTION_ID = '00000000-0000-0000-0000-000000000000';
export const AZURE_STORAGE_ACCOUNT = 'mockcloud';
export const AZURE_VAULT_NAME = 'mockvault';
export const AZURE_COSMOS_ACCOUNT = 'mockcosmos';
export const AZURE_APP_CONFIG_ACCOUNT = 'mockconfig';
export const AZURE_EVENT_GRID_TOPIC = 'mocktopic';

const endpoint = getTestEndpoint();
const accountKey = Buffer.from('mockcloud').toString('base64');

function responseHeaders(headers: Headers) {
  return {
    get(name: string): string | undefined {
      return headers.get(name) ?? undefined;
    },
    has(name: string): boolean {
      return headers.has(name);
    },
    set(): void {},
    delete(): void {},
    toJSON(): Record<string, string> {
      return Object.fromEntries(headers.entries());
    },
    *[Symbol.iterator](): IterableIterator<[string, string]> {
      yield* headers.entries();
    },
  };
}

export const azureCredential: TokenCredential = {
  async getToken(): Promise<AccessToken> {
    return {
      token: 'mockcloud-token',
      expiresOnTimestamp: Date.now() + 3600_000,
    };
  },
};

export function createBlobServiceClient(): BlobServiceClient {
  return new BlobServiceClient(
    `${endpoint}/azure/${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`,
    new StorageSharedKeyCredential(AZURE_STORAGE_ACCOUNT, accountKey),
    { retryOptions: { maxTries: 1 } },
  );
}

export function createSecretClient(): SecretClient {
  return new SecretClient(
    `${endpoint}/azure/${AZURE_VAULT_NAME}.vault.azure.net`,
    azureCredential,
    { retryOptions: { maxRetries: 0 }, allowInsecureConnection: true },
  );
}

export function createKeyClient(): KeyClient {
  return new KeyClient(
    `${endpoint}/azure/${AZURE_VAULT_NAME}.vault.azure.net`,
    azureCredential,
    { retryOptions: { maxRetries: 0 }, allowInsecureConnection: true },
  );
}

export function createAzureProxyHttpClient() {
  return {
    async sendRequest(request: any): Promise<any> {
      const originalUrl = new URL(request.url);
      const rewritten = `${endpoint}/azure/${originalUrl.host}${originalUrl.pathname}${originalUrl.search}`;
      const headers = new Headers();
      for (const [key, value] of request.headers) {
        headers.set(key, value);
      }
      const response = await fetch(rewritten, {
        method: request.method,
        headers,
        body: request.body ?? undefined,
      });
      return {
        request,
        status: response.status,
        headers: responseHeaders(response.headers),
        bodyAsText: await response.text(),
      };
    },
  };
}

export function createResourceManagementClient(): ResourceManagementClient {
  const client = new ResourceManagementClient(
    azureCredential,
    AZURE_SUBSCRIPTION_ID,
    {
      endpoint: `${endpoint}/azure/management.azure.com`,
      retryOptions: { maxRetries: 0 },
      allowInsecureConnection: true,
    },
  );
  client.pipeline.removePolicy({ name: 'bearerTokenAuthenticationPolicy' });
  client.pipeline.addPolicy({
    name: 'bearerTokenAuthenticationPolicy',
    async sendRequest(request, next) {
      request.headers.set('Authorization', 'Bearer mockcloud-token');
      return next(request);
    },
  });
  return client;
}

export function createCosmosClient(): CosmosClient {
  return new CosmosClient({
    endpoint: `${endpoint}/azure/${AZURE_COSMOS_ACCOUNT}.documents.azure.com`,
    key: accountKey,
    connectionPolicy: {
      enableEndpointDiscovery: false,
      requestTimeout: 5000,
    },
  });
}

export function createAppConfigurationClient(): AppConfigurationClient {
  return new AppConfigurationClient(
    `Endpoint=${endpoint}/azure/${AZURE_APP_CONFIG_ACCOUNT}.azconfig.io;Id=mockconfig;Secret=${accountKey}`,
    { retryOptions: { maxRetries: 0 }, allowInsecureConnection: true },
  );
}

export function createEventGridPublisherClient(topicName = AZURE_EVENT_GRID_TOPIC): EventGridPublisherClient<'EventGrid'> {
  return new EventGridPublisherClient(
    `${endpoint}/azure/${topicName}.eastus-1.eventgrid.azure.net/api/events`,
    'EventGrid',
    new AzureKeyCredential(accountKey),
    { retryOptions: { maxRetries: 0 }, allowInsecureConnection: true },
  );
}
