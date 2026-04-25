import { randomUUID } from 'node:crypto';
import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';
import { PersistentMap } from '../../../state/store.js';
import { FUNCTION_APP_NAME, LOCATION, SUBSCRIPTION_ID } from '../../config.js';

interface AzureFunctionApp {
  id: string;
  name: string;
  location: string;
  kind: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
  created: string;
  updated: string;
}

interface AzureFunctionDefinition {
  appName: string;
  id: string;
  name: string;
  config: Record<string, unknown>;
  files?: Record<string, string>;
  testData?: unknown;
  properties?: Record<string, unknown>;
  created: string;
  updated: string;
}

const apps = new PersistentMap<string, AzureFunctionApp>('azure-functions-apps');
const functions = new PersistentMap<string, AzureFunctionDefinition>('azure-functions-functions');

function appKey(appName: string): string {
  return appName.toLowerCase();
}

function functionKey(appName: string, functionName: string): string {
  return `${appName.toLowerCase()}\0${functionName.toLowerCase()}`;
}

function appNameFromHost(req: AzureParsedRequest): string {
  const match = req.azureHost.match(/^([^.]+)\.(?:scm\.)?azurewebsites\.net$/i);
  return match ? match[1] : FUNCTION_APP_NAME;
}

function isScmHost(req: AzureParsedRequest): boolean {
  return /\.scm\.azurewebsites\.net$/i.test(req.azureHost);
}

const deployments = new PersistentMap<string, AzureFunctionDeployment>('azure-functions-deployments');

interface AzureFunctionDeployment {
  appName: string;
  id: string;
  status: number;
  complete: boolean;
  message: string;
  received_time: string;
  start_time: string;
  end_time: string;
  zipSize: number;
}

function pathParts(req: AzureParsedRequest): string[] {
  return req.azurePath.split('/').filter(Boolean).map(decodeURIComponent);
}

function jsonResponse(data: unknown, statusCode = 200): ApiResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(data),
  };
}

function noContent(): ApiResponse {
  return {
    statusCode: 204,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: '',
  };
}

function functionError(code: string, message: string, statusCode: number): ApiResponse {
  return jsonResponse({ error: { code, message } }, statusCode);
}

function functionAppId(appName: string): string {
  return `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/mockcloud/providers/Microsoft.Web/sites/${appName}`;
}

function functionId(appName: string, functionName: string): string {
  return `${apps.get(appKey(appName))?.id ?? functionAppId(appName)}/functions/${functionName}`;
}

function ensureApp(appName: string): AzureFunctionApp {
  const existing = apps.get(appKey(appName));
  if (existing) return existing;
  const now = new Date().toISOString();
  const app: AzureFunctionApp = {
    id: functionAppId(appName),
    name: appName,
    location: LOCATION,
    kind: 'functionapp',
    created: now,
    updated: now,
    properties: {
      state: 'Running',
      defaultHostName: `${appName}.azurewebsites.net`,
    },
  };
  apps.set(appKey(appName), app);
  return app;
}

export function createFunctionAppFromArm(input: {
  id: string;
  name: string;
  location?: string;
  kind?: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
}): void {
  const existing = apps.get(appKey(input.name));
  const now = new Date().toISOString();
  apps.set(appKey(input.name), {
    id: input.id,
    name: input.name,
    location: input.location ?? existing?.location ?? LOCATION,
    kind: input.kind ?? existing?.kind ?? 'functionapp',
    tags: input.tags ?? existing?.tags,
    properties: {
      state: 'Running',
      defaultHostName: `${input.name}.azurewebsites.net`,
      ...(existing?.properties ?? {}),
      ...(input.properties ?? {}),
    },
    created: existing?.created ?? now,
    updated: now,
  });
}

export function deleteFunctionAppFromArm(appName: string): void {
  apps.delete(appKey(appName));
  for (const definition of Array.from(functions.values())) {
    if (definition.appName.toLowerCase() === appName.toLowerCase()) {
      functions.delete(functionKey(definition.appName, definition.name));
    }
  }
}

export function createFunctionFromArm(input: {
  appName: string;
  name: string;
  id?: string;
  config?: Record<string, unknown>;
  files?: Record<string, string>;
  testData?: unknown;
  properties?: Record<string, unknown>;
}): void {
  ensureApp(input.appName);
  upsertFunction(input.appName, input.name, {
    id: input.id,
    config: input.config,
    files: input.files,
    testData: input.testData,
    properties: input.properties,
  });
}

export function deleteFunctionFromArm(appName: string, functionName: string): void {
  functions.delete(functionKey(appName, functionName));
}

function functionEnvelope(definition: AzureFunctionDefinition, req?: AzureParsedRequest): Record<string, unknown> {
  const appName = definition.appName;
  const invokeUrlTemplate = `${req?.headers['x-forwarded-proto'] ?? 'http'}://${req?.headers.host ?? `${appName}.azurewebsites.net`}/azure/${appName}.azurewebsites.net/api/${definition.name}`;
  return {
    id: definition.id,
    name: definition.name,
    type: 'Microsoft.Web/sites/functions',
    properties: {
      name: definition.name,
      function_app_id: apps.get(appKey(appName))?.id ?? functionAppId(appName),
      script_root_path_href: null,
      script_href: null,
      config_href: null,
      test_data_href: null,
      href: null,
      config: definition.config,
      files: definition.files ?? {},
      test_data: definition.testData,
      invoke_url_template: invokeUrlTemplate,
      language: definition.properties?.language ?? 'JavaScript',
      isDisabled: definition.properties?.isDisabled ?? false,
      created: definition.created,
      updated: definition.updated,
    },
  };
}

function upsertFunction(
  appName: string,
  functionName: string,
  input: {
    id?: string;
    config?: Record<string, unknown>;
    files?: Record<string, string>;
    testData?: unknown;
    properties?: Record<string, unknown>;
  },
): AzureFunctionDefinition {
  const existing = functions.get(functionKey(appName, functionName));
  const now = new Date().toISOString();
  const definition: AzureFunctionDefinition = {
    appName,
    id: input.id ?? existing?.id ?? functionId(appName, functionName),
    name: functionName,
    config: input.config ?? existing?.config ?? {
      bindings: [
        {
          authLevel: 'anonymous',
          type: 'httpTrigger',
          direction: 'in',
          name: 'req',
          methods: ['get', 'post'],
        },
        {
          type: 'http',
          direction: 'out',
          name: 'res',
        },
      ],
    },
    files: input.files ?? existing?.files,
    testData: input.testData ?? existing?.testData,
    properties: input.properties ?? existing?.properties,
    created: existing?.created ?? now,
    updated: now,
  };
  functions.set(functionKey(appName, functionName), definition);
  return definition;
}

function listFunctions(req: AzureParsedRequest): ApiResponse {
  const appName = appNameFromHost(req);
  ensureApp(appName);
  const value = Array.from(functions.values())
    .filter((definition) => definition.appName.toLowerCase() === appName.toLowerCase())
    .map((definition) => functionEnvelope(definition, req));
  return jsonResponse(value);
}

function getFunction(req: AzureParsedRequest, functionName: string): ApiResponse {
  const appName = appNameFromHost(req);
  const definition = functions.get(functionKey(appName, functionName));
  if (!definition) return functionError('FunctionNotFound', `Function '${functionName}' was not found.`, 404);
  return jsonResponse(functionEnvelope(definition, req));
}

function putFunction(req: AzureParsedRequest, functionName: string): ApiResponse {
  const appName = appNameFromHost(req);
  ensureApp(appName);
  const body = req.body as Record<string, unknown>;
  const properties = body.properties && typeof body.properties === 'object' && !Array.isArray(body.properties)
    ? body.properties as Record<string, unknown>
    : body;
  const files = properties.files && typeof properties.files === 'object' && !Array.isArray(properties.files)
    ? Object.fromEntries(Object.entries(properties.files as Record<string, unknown>).map(([key, value]) => [key, String(value)]))
    : undefined;
  const config = properties.config && typeof properties.config === 'object' && !Array.isArray(properties.config)
    ? properties.config as Record<string, unknown>
    : undefined;
  const definition = upsertFunction(appName, functionName, {
    config,
    files,
    testData: properties.test_data ?? properties.testData,
    properties,
  });
  return jsonResponse(functionEnvelope(definition, req));
}

function deleteFunction(req: AzureParsedRequest, functionName: string): ApiResponse {
  const appName = appNameFromHost(req);
  if (!functions.delete(functionKey(appName, functionName))) {
    return functionError('FunctionNotFound', `Function '${functionName}' was not found.`, 404);
  }
  return noContent();
}

function invocationInput(req: AzureParsedRequest): unknown {
  if (Object.keys(req.body).length > 0) {
    const body = req.body as Record<string, unknown>;
    return 'input' in body ? body.input : body;
  }
  if (req.rawBody.length > 0) return req.rawBody.toString('utf-8');
  return {};
}

function invokeFunction(req: AzureParsedRequest, functionName: string): ApiResponse {
  const appName = appNameFromHost(req);
  const definition = functions.get(functionKey(appName, functionName));
  if (!definition) return functionError('FunctionNotFound', `Function '${functionName}' was not found.`, 404);
  return jsonResponse({
    invocationId: randomUUID(),
    functionName: definition.name,
    appName,
    method: req.method,
    query: req.queryParams,
    input: invocationInput(req),
  });
}

function hostStatus(req: AzureParsedRequest): ApiResponse {
  const appName = appNameFromHost(req);
  const app = ensureApp(appName);
  return jsonResponse({
    id: app.id,
    state: 'Running',
    version: '4.0.0',
    versionDetails: 'MockCloud',
    processUptime: 0,
  });
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  const [root, second, third] = pathParts(req);

  if (isScmHost(req)) {
    return routeScmRequest(req, [root, second, third]);
  }

  if (root === 'admin' && second === 'host' && third === 'status' && req.method === 'GET') {
    return hostStatus(req);
  }

  if (root === 'admin' && second === 'functions' && !third && req.method === 'GET') {
    return listFunctions(req);
  }

  if (root === 'admin' && second === 'functions' && third) {
    if (req.method === 'GET') return getFunction(req, third);
    if (req.method === 'PUT') return putFunction(req, third);
    if (req.method === 'DELETE') return deleteFunction(req, third);
    if (req.method === 'POST') return invokeFunction(req, third);
  }

  if (root === 'api' && second && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return invokeFunction(req, second);
  }

  return functionError('BadRequest', 'The requested Azure Functions operation is not supported by MockCloud.', 400);
}

function routeScmRequest(req: AzureParsedRequest, [root, second, third]: string[]): ApiResponse {
  const appName = appNameFromHost(req);
  ensureApp(appName);

  if (root === 'api' && second === 'zipdeploy' && req.method === 'POST') {
    return zipDeploy(req, appName);
  }

  if (root === 'api' && second === 'deployments' && req.method === 'GET') {
    const parts = pathParts(req);
    if (parts.length === 2) return jsonResponse(listDeployments(appName));
    if (parts.length === 3) return getDeployment(appName, parts[2]);
    if (parts.length === 4 && parts[3].toLowerCase() === 'log') return getDeploymentLog(appName, parts[2]);
  }

  if (root === 'api' && second === 'settings' && req.method === 'GET') {
    return jsonResponse({ SCM_DO_BUILD_DURING_DEPLOYMENT: 'true', ENABLE_ORYX_BUILD: 'true' });
  }

  if (root === 'api' && second === 'isdeploying' && req.method === 'GET') {
    return jsonResponse({ value: false });
  }

  return functionError('NotFound', `The SCM endpoint /${[root, second, third].filter(Boolean).join('/')} is not supported by MockCloud.`, 404);
}

function zipDeploy(req: AzureParsedRequest, appName: string): ApiResponse {
  const now = new Date().toISOString();
  const id = randomUUID();
  const deployment: AzureFunctionDeployment = {
    appName,
    id,
    status: 4,
    complete: true,
    message: 'Zip deployment succeeded.',
    received_time: now,
    start_time: now,
    end_time: now,
    zipSize: req.rawBody.length,
  };
  deployments.set(`${appName.toLowerCase()}\0${id}`, deployment);
  deployments.set(`${appName.toLowerCase()}\0latest`, deployment);
  return {
    statusCode: 202,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Location: `https://${appName}.scm.azurewebsites.net/api/deployments/${id}`,
    },
    body: JSON.stringify(deploymentEnvelope(deployment)),
  };
}

function getDeployment(appName: string, idOrLatest: string): ApiResponse {
  const deployment = deployments.get(`${appName.toLowerCase()}\0${idOrLatest.toLowerCase()}`);
  if (!deployment) {
    return functionError('NotFound', `Deployment '${idOrLatest}' was not found for app '${appName}'.`, 404);
  }
  return jsonResponse(deploymentEnvelope(deployment));
}

function listDeployments(appName: string): unknown[] {
  return Array.from(deployments.values())
    .filter((d) => d.appName.toLowerCase() === appName.toLowerCase() && d.id !== 'latest')
    .map(deploymentEnvelope);
}

function getDeploymentLog(appName: string, idOrLatest: string): ApiResponse {
  const deployment = deployments.get(`${appName.toLowerCase()}\0${idOrLatest.toLowerCase()}`);
  if (!deployment) {
    return functionError('NotFound', `Deployment '${idOrLatest}' was not found for app '${appName}'.`, 404);
  }
  return jsonResponse([
    {
      log_time: deployment.received_time,
      id: `${deployment.id}:received`,
      message: `Received deployment package of ${deployment.zipSize} bytes.`,
      type: 0,
      details_url: null,
    },
    {
      log_time: deployment.end_time,
      id: `${deployment.id}:complete`,
      message: deployment.message,
      type: 0,
      details_url: null,
    },
  ]);
}

function deploymentEnvelope(deployment: AzureFunctionDeployment): Record<string, unknown> {
  return {
    id: deployment.id,
    status: deployment.status,
    status_text: 'Success',
    author_email: 'mockcloud@example.com',
    author: 'mockcloud',
    deployer: 'ZipDeploy',
    message: deployment.message,
    progress: '',
    received_time: deployment.received_time,
    start_time: deployment.start_time,
    end_time: deployment.end_time,
    last_success_end_time: deployment.end_time,
    complete: deployment.complete,
    active: true,
    is_temp: false,
    is_readonly: false,
    url: `https://${deployment.appName}.scm.azurewebsites.net/api/deployments/${deployment.id}`,
    log_url: `https://${deployment.appName}.scm.azurewebsites.net/api/deployments/${deployment.id}/log`,
    site_name: deployment.appName,
    site_bytes: deployment.zipSize,
  };
}

export const azureFunctionsService: AzureServiceDefinition = {
  name: 'azure-functions',
  hostPatterns: ['*.azurewebsites.net', '*.scm.azurewebsites.net'],
  handlers: {
    _default: routeRequest,
  },
};
