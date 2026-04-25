import { ENDPOINT } from './clients';

export const AZURE_SUBSCRIPTION_ID = '00000000-0000-0000-0000-000000000000';
export const AZURE_STORAGE_ACCOUNT = 'mockcloud';
export const AZURE_VAULT_NAME = 'mockvault';
export const AZURE_COSMOS_ACCOUNT = 'mockcosmos';
export const AZURE_APP_CONFIG_ACCOUNT = 'mockconfig';
export const AZURE_FUNCTION_APP_NAME = 'mockfunc';
export const AZURE_EVENT_GRID_TOPIC = 'mocktopic';
export const AZURE_API_MANAGEMENT_SERVICE = 'mockapim';
export const AZURE_RESOURCE_GROUP = 'mockcloud';
export const AZURE_MONITOR_WORKSPACE = 'mockworkspace';

export interface AzureContainer {
  name: string;
  lastModified: string;
  etag: string;
}

export interface AzureBlob {
  name: string;
  lastModified: string;
  etag: string;
  size: number;
  contentType: string;
}

export interface AzureSecret {
  id: string;
  name: string;
  contentType?: string;
  value?: string;
  tags?: Record<string, string>;
  attributes?: {
    created?: number;
    updated?: number;
  };
}

export interface AzureKey {
  id: string;
  name: string;
  keyType?: string;
  keyOps?: string[];
  attributes?: {
    created?: number;
    updated?: number;
  };
}

export interface AzureResourceGroup {
  id: string;
  name: string;
  location: string;
  tags?: Record<string, string>;
  properties?: {
    provisioningState?: string;
  };
}

export interface AzureCosmosDatabase {
  id: string;
  _etag?: string;
  _ts?: number;
}

export interface AzureCosmosContainer {
  id: string;
  partitionKey?: {
    paths?: string[];
  };
  _etag?: string;
  _ts?: number;
}

export interface AzureCosmosItem {
  id: string;
  _etag?: string;
  _ts?: number;
  [key: string]: unknown;
}

export interface AzureAppConfigSetting {
  key: string;
  label?: string;
  value?: string;
  content_type?: string;
  last_modified?: string;
  etag?: string;
  tags?: Record<string, string>;
  locked?: boolean;
}

export interface AzureFunctionDefinition {
  id: string;
  name: string;
  properties?: {
    config?: Record<string, unknown>;
    files?: Record<string, string>;
    test_data?: unknown;
    invoke_url_template?: string;
    updated?: string;
  };
}

export interface AzureEventGridEvent {
  id: string;
  topicName: string;
  schema: string;
  subject?: string;
  eventType?: string;
  eventTime: string;
  data?: unknown;
  raw?: Record<string, unknown>;
}

export interface AzureEventGridSubscription {
  id: string;
  name: string;
  type?: string;
  properties?: {
    destination?: Record<string, unknown>;
    filter?: Record<string, unknown>;
    labels?: string[];
    provisioningState?: string;
  };
}

export interface AzureApiManagementApi {
  id: string;
  name: string;
  type?: string;
  properties?: {
    displayName?: string;
    path?: string;
    protocols?: string[];
    serviceUrl?: string;
    provisioningState?: string;
  };
}

export interface AzureApiManagementOperation {
  id: string;
  name: string;
  type?: string;
  properties?: {
    displayName?: string;
    method?: string;
    urlTemplate?: string;
    provisioningState?: string;
  };
}

export interface AzureNetworkSecurityRule {
  name: string;
  properties?: {
    priority?: number;
    direction?: string;
    access?: string;
    protocol?: string;
    sourcePortRange?: string;
    destinationPortRange?: string;
    sourceAddressPrefix?: string;
    destinationAddressPrefix?: string;
  };
}

export interface AzureNetworkSecurityGroup {
  id: string;
  name: string;
  type?: string;
  location?: string;
  tags?: Record<string, string>;
  properties?: {
    provisioningState?: string;
    securityRules?: AzureNetworkSecurityRule[];
  };
}

export interface AzureMonitorTable {
  id: string;
  name: string;
  type?: string;
  properties?: {
    provisioningState?: string;
    retentionInDays?: number;
    totalRetentionInDays?: number;
    recordCount?: number;
  };
}

export interface AzureMonitorRecord {
  id: string;
  workspaceName: string;
  tableName: string;
  timeGenerated: string;
  data: Record<string, unknown>;
}

export interface AzureWafPolicy {
  id: string;
  name: string;
  type?: string;
  location?: string;
  tags?: Record<string, string>;
  properties?: {
    provisioningState?: string;
    policySettings?: Record<string, unknown>;
    managedRules?: Record<string, unknown>;
    customRules?: Array<Record<string, unknown>>;
  };
}

export interface AzureDefenderPlan {
  id: string;
  name: string;
  type?: string;
  properties?: {
    pricingTier?: string;
    subPlan?: string;
    extensions?: Array<Record<string, unknown>>;
  };
}

export interface AzureManagedIdentity {
  id: string;
  name: string;
  type?: string;
  location?: string;
  tags?: Record<string, string>;
  properties?: {
    clientId?: string;
    principalId?: string;
    tenantId?: string;
    provisioningState?: string;
  };
}

export interface AzureRoleAssignment {
  id: string;
  name: string;
  type?: string;
  properties?: {
    roleDefinitionId?: string;
    principalId?: string;
    principalType?: string;
    scope?: string;
    condition?: string;
  };
}

export interface AzureGraphUser {
  id: string;
  displayName?: string;
  userPrincipalName?: string;
  mailNickname?: string;
  accountEnabled?: boolean;
  createdDateTime?: string;
}

export interface AzureGraphGroup {
  id: string;
  displayName?: string;
  mailNickname?: string;
  mailEnabled?: boolean;
  securityEnabled?: boolean;
  createdDateTime?: string;
}

export interface AzureGraphApplication {
  id: string;
  appId: string;
  displayName?: string;
  signInAudience?: string;
  identifierUris?: string[];
  createdDateTime?: string;
}

export interface AzureGraphServicePrincipal {
  id: string;
  appId: string;
  displayName?: string;
  servicePrincipalType?: string;
  accountEnabled?: boolean;
  createdDateTime?: string;
}

function azureUrl(host: string, path = '/', params?: Record<string, string>): string {
  const url = new URL(`${ENDPOINT}/azure/${host}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function blobHost(): string {
  return `${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`;
}

function vaultHost(): string {
  return `${AZURE_VAULT_NAME}.vault.azure.net`;
}

function cosmosHost(): string {
  return `${AZURE_COSMOS_ACCOUNT}.documents.azure.com`;
}

function appConfigHost(): string {
  return `${AZURE_APP_CONFIG_ACCOUNT}.azconfig.io`;
}

function functionsHost(appName = AZURE_FUNCTION_APP_NAME): string {
  return `${appName}.azurewebsites.net`;
}

function eventGridHost(topicName = AZURE_EVENT_GRID_TOPIC): string {
  return `${topicName}.eastus-1.eventgrid.azure.net`;
}

function apiManagementHost(serviceName = AZURE_API_MANAGEMENT_SERVICE): string {
  return `${serviceName}.azure-api.net`;
}

function monitorHost(workspaceName = AZURE_MONITOR_WORKSPACE): string {
  return `${workspaceName}.ods.opinsights.azure.com`;
}

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: 'Bearer mockcloud',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function requestXml(url: string, init?: RequestInit): Promise<Document> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const text = await response.text();
  return new DOMParser().parseFromString(text, 'application/xml');
}

function text(parent: Element, selector: string): string {
  return parent.querySelector(selector)?.textContent ?? '';
}

function nameFromId(id: string): string {
  const parts = id.split('/').filter(Boolean);
  const collectionIndex = parts.findIndex((part) => ['deletedsecrets', 'keys', 'secrets'].includes(part.toLowerCase()));
  return decodeURIComponent(parts[collectionIndex + 1] ?? parts[parts.length - 1] ?? '');
}

export async function listAzureContainers(): Promise<AzureContainer[]> {
  const xml = await requestXml(azureUrl(blobHost(), '/', { comp: 'list' }));
  return Array.from(xml.querySelectorAll('Container')).map((item) => ({
    name: text(item, 'Name'),
    lastModified: text(item, 'Last-Modified'),
    etag: text(item, 'Etag'),
  }));
}

export async function createAzureContainer(name: string): Promise<void> {
  await requestXml(azureUrl(blobHost(), `/${encodeURIComponent(name)}`, { restype: 'container' }), {
    method: 'PUT',
  });
}

export async function deleteAzureContainer(name: string): Promise<void> {
  await requestXml(azureUrl(blobHost(), `/${encodeURIComponent(name)}`, { restype: 'container' }), {
    method: 'DELETE',
  });
}

export async function listAzureBlobs(container: string): Promise<AzureBlob[]> {
  const xml = await requestXml(azureUrl(blobHost(), `/${encodeURIComponent(container)}`, { comp: 'list' }));
  return Array.from(xml.querySelectorAll('Blob')).map((item) => ({
    name: text(item, 'Name'),
    lastModified: text(item, 'Last-Modified'),
    etag: text(item, 'Etag'),
    size: Number(text(item, 'Content-Length') || '0'),
    contentType: text(item, 'Content-Type'),
  }));
}

export async function putAzureBlob(container: string, blob: string, body: string, contentType: string): Promise<void> {
  const response = await fetch(azureUrl(blobHost(), `/${encodeURIComponent(container)}/${encodePath(blob)}`), {
    method: 'PUT',
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'x-ms-blob-content-type': contentType || 'text/plain',
    },
    body,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function deleteAzureBlob(container: string, blob: string): Promise<void> {
  await requestXml(azureUrl(blobHost(), `/${encodeURIComponent(container)}/${encodePath(blob)}`), {
    method: 'DELETE',
  });
}

export async function listAzureSecrets(): Promise<AzureSecret[]> {
  const result = await requestJson<{ value?: AzureSecret[] }>(azureUrl(vaultHost(), '/secrets', { 'api-version': '2025-07-01' }));
  return (result.value ?? []).map((secret) => ({ ...secret, name: nameFromId(secret.id) }));
}

export async function getAzureSecret(name: string): Promise<AzureSecret> {
  const result = await requestJson<AzureSecret>(azureUrl(vaultHost(), `/secrets/${encodeURIComponent(name)}`, { 'api-version': '2025-07-01' }));
  return { ...result, name };
}

export async function setAzureSecret(name: string, value: string, contentType: string): Promise<void> {
  await requestJson(azureUrl(vaultHost(), `/secrets/${encodeURIComponent(name)}`, { 'api-version': '2025-07-01' }), {
    method: 'PUT',
    body: JSON.stringify({
      value,
      contentType: contentType || undefined,
    }),
  });
}

export async function deleteAzureSecret(name: string): Promise<void> {
  await requestJson(azureUrl(vaultHost(), `/secrets/${encodeURIComponent(name)}`, { 'api-version': '2025-07-01' }), {
    method: 'DELETE',
  });
}

export async function listAzureKeys(): Promise<AzureKey[]> {
  const result = await requestJson<{ value?: Array<{ kid: string; attributes?: AzureKey['attributes'] }> }>(
    azureUrl(vaultHost(), '/keys', { 'api-version': '7.6' }),
  );
  return (result.value ?? []).map((key) => ({
    id: key.kid,
    name: nameFromId(key.kid),
    attributes: key.attributes,
  }));
}

export async function createAzureKey(name: string): Promise<void> {
  await requestJson(azureUrl(vaultHost(), `/keys/${encodeURIComponent(name)}/create`, { 'api-version': '7.6' }), {
    method: 'POST',
    body: JSON.stringify({
      kty: 'RSA',
      key_ops: ['encrypt', 'decrypt'],
    }),
  });
}

export async function listAzureResourceGroups(): Promise<AzureResourceGroup[]> {
  const result = await requestJson<{ value?: AzureResourceGroup[] }>(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourcegroups`, { 'api-version': '2025-04-01' }),
  );
  return result.value ?? [];
}

export async function createAzureResourceGroup(name: string, location: string): Promise<void> {
  await requestJson(azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourcegroups/${encodeURIComponent(name)}`, { 'api-version': '2025-04-01' }), {
    method: 'PUT',
    body: JSON.stringify({
      location: location || 'eastus',
    }),
  });
}

export async function deleteAzureResourceGroup(name: string): Promise<void> {
  await requestJson(azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourcegroups/${encodeURIComponent(name)}`, { 'api-version': '2025-04-01' }), {
    method: 'DELETE',
  });
}

export async function listAzureCosmosDatabases(): Promise<AzureCosmosDatabase[]> {
  const result = await requestJson<{ Databases?: AzureCosmosDatabase[] }>(azureUrl(cosmosHost(), '/dbs'));
  return result.Databases ?? [];
}

export async function createAzureCosmosDatabase(id: string): Promise<void> {
  await requestJson(azureUrl(cosmosHost(), '/dbs'), {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export async function deleteAzureCosmosDatabase(id: string): Promise<void> {
  await requestJson(azureUrl(cosmosHost(), `/dbs/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
}

export async function listAzureCosmosContainers(databaseId: string): Promise<AzureCosmosContainer[]> {
  const result = await requestJson<{ DocumentCollections?: AzureCosmosContainer[] }>(
    azureUrl(cosmosHost(), `/dbs/${encodeURIComponent(databaseId)}/colls`),
  );
  return result.DocumentCollections ?? [];
}

export async function createAzureCosmosContainer(databaseId: string, id: string, partitionKeyPath: string): Promise<void> {
  await requestJson(azureUrl(cosmosHost(), `/dbs/${encodeURIComponent(databaseId)}/colls`), {
    method: 'POST',
    body: JSON.stringify({
      id,
      partitionKey: { paths: [partitionKeyPath || '/id'] },
    }),
  });
}

export async function deleteAzureCosmosContainer(databaseId: string, id: string): Promise<void> {
  await requestJson(azureUrl(cosmosHost(), `/dbs/${encodeURIComponent(databaseId)}/colls/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
}

export async function listAzureCosmosItems(databaseId: string, containerId: string): Promise<AzureCosmosItem[]> {
  const result = await requestJson<{ Documents?: AzureCosmosItem[] }>(
    azureUrl(cosmosHost(), `/dbs/${encodeURIComponent(databaseId)}/colls/${encodeURIComponent(containerId)}/docs`),
  );
  return result.Documents ?? [];
}

export async function upsertAzureCosmosItem(databaseId: string, containerId: string, item: AzureCosmosItem): Promise<void> {
  await requestJson(azureUrl(cosmosHost(), `/dbs/${encodeURIComponent(databaseId)}/colls/${encodeURIComponent(containerId)}/docs`), {
    method: 'POST',
    headers: {
      'x-ms-documentdb-is-upsert': 'true',
    },
    body: JSON.stringify(item),
  });
}

export async function deleteAzureCosmosItem(databaseId: string, containerId: string, id: string): Promise<void> {
  await requestJson(azureUrl(cosmosHost(), `/dbs/${encodeURIComponent(databaseId)}/colls/${encodeURIComponent(containerId)}/docs/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
}

export async function listAzureAppConfigSettings(): Promise<AzureAppConfigSetting[]> {
  const result = await requestJson<{ items?: AzureAppConfigSetting[] }>(
    azureUrl(appConfigHost(), '/kv', { 'api-version': '2023-11-01', key: '*' }),
  );
  return result.items ?? [];
}

export async function setAzureAppConfigSetting(key: string, label: string, value: string, contentType: string): Promise<void> {
  const params: Record<string, string> = { 'api-version': '2023-11-01' };
  if (label) params.label = label;
  await requestJson(azureUrl(appConfigHost(), `/kv/${encodePath(key)}`, params), {
    method: 'PUT',
    body: JSON.stringify({
      key,
      label: label || undefined,
      value,
      content_type: contentType || undefined,
    }),
  });
}

export async function deleteAzureAppConfigSetting(key: string, label?: string): Promise<void> {
  const params: Record<string, string> = { 'api-version': '2023-11-01' };
  if (label) params.label = label;
  await requestJson(azureUrl(appConfigHost(), `/kv/${encodePath(key)}`, params), {
    method: 'DELETE',
  });
}

export async function listAzureFunctions(appName = AZURE_FUNCTION_APP_NAME): Promise<AzureFunctionDefinition[]> {
  return requestJson<AzureFunctionDefinition[]>(azureUrl(functionsHost(appName), '/admin/functions'));
}

export async function putAzureFunction(appName: string, name: string): Promise<void> {
  await requestJson(azureUrl(functionsHost(appName), `/admin/functions/${encodeURIComponent(name)}`), {
    method: 'PUT',
    body: JSON.stringify({
      properties: {
        config: {
          bindings: [
            { authLevel: 'anonymous', type: 'httpTrigger', direction: 'in', name: 'req', methods: ['get', 'post'] },
            { type: 'http', direction: 'out', name: 'res' },
          ],
        },
        files: {
          'index.js': 'module.exports = async function (context, req) { context.res = { body: req.body }; }',
        },
      },
    }),
  });
}

export async function deleteAzureFunction(appName: string, name: string): Promise<void> {
  await requestJson(azureUrl(functionsHost(appName), `/admin/functions/${encodeURIComponent(name)}`), {
    method: 'DELETE',
  });
}

export async function invokeAzureFunction(appName: string, name: string, input: unknown): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(azureUrl(functionsHost(appName), `/api/${encodeURIComponent(name)}`), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listAzureEventGridEvents(topicName = AZURE_EVENT_GRID_TOPIC): Promise<AzureEventGridEvent[]> {
  const result = await requestJson<{ value?: AzureEventGridEvent[] }>(azureUrl(eventGridHost(topicName), '/api/events'));
  return result.value ?? [];
}

export async function publishAzureEventGridEvent(topicName: string, subject: string, eventType: string, data: unknown): Promise<void> {
  await requestJson(azureUrl(eventGridHost(topicName), '/api/events'), {
    method: 'POST',
    body: JSON.stringify([
      {
        subject,
        eventType,
        dataVersion: '1.0',
        data,
      },
    ]),
  });
}

export async function listAzureEventGridSubscriptions(topicName = AZURE_EVENT_GRID_TOPIC): Promise<AzureEventGridSubscription[]> {
  const result = await requestJson<{ value?: AzureEventGridSubscription[] }>(azureUrl(eventGridHost(topicName), '/api/subscriptions'));
  return result.value ?? [];
}

export async function listAzureApiManagementApis(serviceName = AZURE_API_MANAGEMENT_SERVICE): Promise<AzureApiManagementApi[]> {
  const result = await requestJson<{ value?: AzureApiManagementApi[] }>(azureUrl(apiManagementHost(serviceName), '/apis'));
  return result.value ?? [];
}

export async function putAzureApiManagementApi(serviceName: string, name: string, path: string): Promise<void> {
  await requestJson(azureUrl(apiManagementHost(serviceName), `/apis/${encodeURIComponent(name)}`), {
    method: 'PUT',
    body: JSON.stringify({
      properties: {
        displayName: name,
        path: path || name,
        protocols: ['https'],
      },
    }),
  });
}

export async function deleteAzureApiManagementApi(serviceName: string, name: string): Promise<void> {
  await requestJson(azureUrl(apiManagementHost(serviceName), `/apis/${encodeURIComponent(name)}`), {
    method: 'DELETE',
  });
}

export async function listAzureApiManagementOperations(
  serviceName: string,
  apiName: string,
): Promise<AzureApiManagementOperation[]> {
  const result = await requestJson<{ value?: AzureApiManagementOperation[] }>(
    azureUrl(apiManagementHost(serviceName), `/apis/${encodeURIComponent(apiName)}/operations`),
  );
  return result.value ?? [];
}

export async function putAzureApiManagementOperation(
  serviceName: string,
  apiName: string,
  operationName: string,
  method: string,
  urlTemplate: string,
): Promise<void> {
  await requestJson(azureUrl(apiManagementHost(serviceName), `/apis/${encodeURIComponent(apiName)}/operations/${encodeURIComponent(operationName)}`), {
    method: 'PUT',
    body: JSON.stringify({
      properties: {
        displayName: operationName,
        method: method || 'GET',
        urlTemplate: urlTemplate || '/',
      },
    }),
  });
}

export async function deleteAzureApiManagementOperation(serviceName: string, apiName: string, operationName: string): Promise<void> {
  await requestJson(azureUrl(apiManagementHost(serviceName), `/apis/${encodeURIComponent(apiName)}/operations/${encodeURIComponent(operationName)}`), {
    method: 'DELETE',
  });
}

export async function invokeAzureApiManagementEndpoint(
  serviceName: string,
  path: string,
  method: string,
  input: unknown,
): Promise<Record<string, unknown>> {
  const body = method.toUpperCase() === 'GET' ? undefined : JSON.stringify(input);
  return requestJson<Record<string, unknown>>(azureUrl(apiManagementHost(serviceName), `/${path.replace(/^\/+/, '')}`), {
    method,
    body,
  });
}

export async function listAzureNetworkSecurityGroups(resourceGroupName = AZURE_RESOURCE_GROUP): Promise<AzureNetworkSecurityGroup[]> {
  const result = await requestJson<{ value?: AzureNetworkSecurityGroup[] }>(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${encodeURIComponent(resourceGroupName)}/resources`, { 'api-version': '2021-04-01' }),
  );
  return (result.value ?? []).filter((resource) => resource.type?.toLowerCase() === 'microsoft.network/networksecuritygroups');
}

export async function putAzureNetworkSecurityGroup(name: string, ruleName: string, priority: number, destinationPortRange: string): Promise<void> {
  await requestJson(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${AZURE_RESOURCE_GROUP}/providers/Microsoft.Network/networkSecurityGroups/${encodeURIComponent(name)}`, { 'api-version': '2024-05-01' }),
    {
      method: 'PUT',
      body: JSON.stringify({
        location: 'eastus',
        properties: {
          securityRules: [
            {
              name: ruleName || 'allowHttp',
              properties: {
                priority,
                direction: 'Inbound',
                access: 'Allow',
                protocol: 'Tcp',
                sourcePortRange: '*',
                destinationPortRange: destinationPortRange || '80',
                sourceAddressPrefix: '*',
                destinationAddressPrefix: '*',
              },
            },
          ],
        },
      }),
    },
  );
}

export async function deleteAzureNetworkSecurityGroup(name: string): Promise<void> {
  await requestJson(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${AZURE_RESOURCE_GROUP}/providers/Microsoft.Network/networkSecurityGroups/${encodeURIComponent(name)}`, { 'api-version': '2024-05-01' }),
    { method: 'DELETE' },
  );
}

export async function listAzureMonitorTables(workspaceName = AZURE_MONITOR_WORKSPACE): Promise<AzureMonitorTable[]> {
  const result = await requestJson<{ value?: AzureMonitorTable[] }>(azureUrl(monitorHost(workspaceName), '/api/tables'));
  return result.value ?? [];
}

export async function listAzureMonitorRecords(workspaceName: string, tableName: string): Promise<AzureMonitorRecord[]> {
  const result = await requestJson<{ value?: AzureMonitorRecord[] }>(
    azureUrl(monitorHost(workspaceName), `/api/tables/${encodeURIComponent(tableName)}/records`),
  );
  return result.value ?? [];
}

export async function ingestAzureMonitorRecord(workspaceName: string, tableName: string, data: Record<string, unknown>): Promise<void> {
  await requestJson(azureUrl(monitorHost(workspaceName), '/api/logs', { 'api-version': '2016-04-01' }), {
    method: 'POST',
    headers: {
      'Log-Type': tableName,
    },
    body: JSON.stringify([data]),
  });
}

export async function queryAzureMonitorLogs(workspaceName: string, query: string): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(azureUrl('api.loganalytics.io', `/v1/workspaces/${encodeURIComponent(workspaceName)}/query`), {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function listAzureWafPolicies(resourceGroupName = AZURE_RESOURCE_GROUP): Promise<AzureWafPolicy[]> {
  const result = await requestJson<{ value?: AzureWafPolicy[] }>(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${encodeURIComponent(resourceGroupName)}/resources`, { 'api-version': '2021-04-01' }),
  );
  return (result.value ?? []).filter((resource) => resource.type?.toLowerCase() === 'microsoft.network/applicationgatewaywebapplicationfirewallpolicies');
}

export async function putAzureWafPolicy(name: string, mode: string): Promise<void> {
  await requestJson(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${AZURE_RESOURCE_GROUP}/providers/Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/${encodeURIComponent(name)}`, { 'api-version': '2024-05-01' }),
    {
      method: 'PUT',
      body: JSON.stringify({
        location: 'eastus',
        properties: {
          policySettings: {
            enabledState: 'Enabled',
            mode: mode || 'Prevention',
            requestBodyCheck: true,
          },
          managedRules: {
            managedRuleSets: [
              {
                ruleSetType: 'OWASP',
                ruleSetVersion: '3.2',
              },
            ],
          },
          customRules: [],
        },
      }),
    },
  );
}

export async function deleteAzureWafPolicy(name: string): Promise<void> {
  await requestJson(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${AZURE_RESOURCE_GROUP}/providers/Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/${encodeURIComponent(name)}`, { 'api-version': '2024-05-01' }),
    { method: 'DELETE' },
  );
}

export async function listAzureDefenderPlans(): Promise<AzureDefenderPlan[]> {
  const result = await requestJson<{ value?: AzureDefenderPlan[] }>(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resources`, { 'api-version': '2021-04-01' }),
  );
  return (result.value ?? []).filter((resource) => resource.type?.toLowerCase() === 'microsoft.security/pricings');
}

export async function putAzureDefenderPlan(name: string, pricingTier: string, subPlan: string): Promise<void> {
  await requestJson(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/providers/Microsoft.Security/pricings/${encodeURIComponent(name)}`, { 'api-version': '2024-01-01' }),
    {
      method: 'PUT',
      body: JSON.stringify({
        properties: {
          pricingTier: pricingTier || 'Standard',
          subPlan: subPlan || undefined,
          extensions: [
            {
              name: 'OnUploadMalwareScanning',
              isEnabled: 'True',
              additionalExtensionProperties: {
                capGBPerMonthPerStorageAccount: '5000',
              },
            },
          ],
        },
      }),
    },
  );
}

export async function deleteAzureDefenderPlan(name: string): Promise<void> {
  await requestJson(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/providers/Microsoft.Security/pricings/${encodeURIComponent(name)}`, { 'api-version': '2024-01-01' }),
    { method: 'DELETE' },
  );
}

export async function listAzureManagedIdentities(resourceGroupName = AZURE_RESOURCE_GROUP): Promise<AzureManagedIdentity[]> {
  const result = await requestJson<{ value?: AzureManagedIdentity[] }>(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${encodeURIComponent(resourceGroupName)}/resources`, { 'api-version': '2021-04-01' }),
  );
  return (result.value ?? []).filter((resource) => resource.type?.toLowerCase() === 'microsoft.managedidentity/userassignedidentities');
}

export async function putAzureManagedIdentity(name: string): Promise<void> {
  await requestJson(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${AZURE_RESOURCE_GROUP}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${encodeURIComponent(name)}`, { 'api-version': '2023-01-31' }),
    {
      method: 'PUT',
      body: JSON.stringify({
        location: 'eastus',
        properties: {
          clientId: crypto.randomUUID(),
          principalId: crypto.randomUUID(),
          tenantId: '00000000-0000-0000-0000-000000000000',
          provisioningState: 'Succeeded',
        },
      }),
    },
  );
}

export async function deleteAzureManagedIdentity(name: string): Promise<void> {
  await requestJson(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${AZURE_RESOURCE_GROUP}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${encodeURIComponent(name)}`, { 'api-version': '2023-01-31' }),
    { method: 'DELETE' },
  );
}

export async function listAzureRoleAssignments(): Promise<AzureRoleAssignment[]> {
  const result = await requestJson<{ value?: AzureRoleAssignment[] }>(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resources`, { 'api-version': '2021-04-01' }),
  );
  return (result.value ?? []).filter((resource) => resource.type?.toLowerCase() === 'microsoft.authorization/roleassignments');
}

export async function putAzureRoleAssignment(name: string, principalId: string, roleDefinitionId: string): Promise<void> {
  await requestJson(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/providers/Microsoft.Authorization/roleAssignments/${encodeURIComponent(name)}`, { 'api-version': '2022-04-01' }),
    {
      method: 'PUT',
      body: JSON.stringify({
        properties: {
          principalId,
          principalType: 'ServicePrincipal',
          roleDefinitionId: roleDefinitionId || `/subscriptions/${AZURE_SUBSCRIPTION_ID}/providers/Microsoft.Authorization/roleDefinitions/b24988ac-6180-42a0-ab88-20f7382dd24c`,
          scope: `/subscriptions/${AZURE_SUBSCRIPTION_ID}`,
        },
      }),
    },
  );
}

export async function deleteAzureRoleAssignment(name: string): Promise<void> {
  await requestJson(
    azureUrl('management.azure.com', `/subscriptions/${AZURE_SUBSCRIPTION_ID}/providers/Microsoft.Authorization/roleAssignments/${encodeURIComponent(name)}`, { 'api-version': '2022-04-01' }),
    { method: 'DELETE' },
  );
}

export async function listAzureGraphUsers(): Promise<AzureGraphUser[]> {
  const result = await requestJson<{ value?: AzureGraphUser[] }>(azureUrl('graph.microsoft.com', '/v1.0/users'));
  return result.value ?? [];
}

export async function createAzureGraphUser(displayName: string, userPrincipalName: string): Promise<void> {
  const mailNickname = userPrincipalName.split('@')[0] || displayName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  await requestJson(azureUrl('graph.microsoft.com', '/v1.0/users'), {
    method: 'POST',
    body: JSON.stringify({
      displayName,
      userPrincipalName,
      mailNickname,
      accountEnabled: true,
    }),
  });
}

export async function deleteAzureGraphUser(id: string): Promise<void> {
  await requestJson(azureUrl('graph.microsoft.com', `/v1.0/users/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
}

export async function listAzureGraphGroups(): Promise<AzureGraphGroup[]> {
  const result = await requestJson<{ value?: AzureGraphGroup[] }>(azureUrl('graph.microsoft.com', '/v1.0/groups'));
  return result.value ?? [];
}

export async function createAzureGraphGroup(displayName: string): Promise<void> {
  await requestJson(azureUrl('graph.microsoft.com', '/v1.0/groups'), {
    method: 'POST',
    body: JSON.stringify({
      displayName,
      mailNickname: displayName.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'group',
      mailEnabled: false,
      securityEnabled: true,
    }),
  });
}

export async function deleteAzureGraphGroup(id: string): Promise<void> {
  await requestJson(azureUrl('graph.microsoft.com', `/v1.0/groups/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
}

export async function listAzureGraphApplications(): Promise<AzureGraphApplication[]> {
  const result = await requestJson<{ value?: AzureGraphApplication[] }>(azureUrl('graph.microsoft.com', '/v1.0/applications'));
  return result.value ?? [];
}

export async function createAzureGraphApplication(displayName: string): Promise<void> {
  await requestJson(azureUrl('graph.microsoft.com', '/v1.0/applications'), {
    method: 'POST',
    body: JSON.stringify({
      displayName,
      signInAudience: 'AzureADMyOrg',
      identifierUris: [],
    }),
  });
}

export async function deleteAzureGraphApplication(id: string): Promise<void> {
  await requestJson(azureUrl('graph.microsoft.com', `/v1.0/applications/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
}

export async function listAzureGraphServicePrincipals(): Promise<AzureGraphServicePrincipal[]> {
  const result = await requestJson<{ value?: AzureGraphServicePrincipal[] }>(azureUrl('graph.microsoft.com', '/v1.0/servicePrincipals'));
  return result.value ?? [];
}

export async function createAzureGraphServicePrincipal(appId: string, displayName: string): Promise<void> {
  await requestJson(azureUrl('graph.microsoft.com', '/v1.0/servicePrincipals'), {
    method: 'POST',
    body: JSON.stringify({
      appId,
      displayName: displayName || undefined,
      servicePrincipalType: 'Application',
      accountEnabled: true,
    }),
  });
}

export async function deleteAzureGraphServicePrincipal(id: string): Promise<void> {
  await requestJson(azureUrl('graph.microsoft.com', `/v1.0/servicePrincipals/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
}
