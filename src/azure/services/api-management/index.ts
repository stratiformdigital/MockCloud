import { randomUUID } from 'node:crypto';
import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';
import { PersistentMap } from '../../../state/store.js';
import { API_MANAGEMENT_SERVICE, LOCATION, SUBSCRIPTION_ID } from '../../config.js';

interface ApiManagementService {
  id: string;
  name: string;
  location: string;
  gatewayUrl: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
  sku?: unknown;
  created: string;
  updated: string;
}

interface ApiManagementApi {
  id: string;
  serviceName: string;
  name: string;
  path: string;
  displayName: string;
  protocols: string[];
  serviceUrl?: string;
  properties?: Record<string, unknown>;
  created: string;
  updated: string;
}

interface ApiManagementOperation {
  id: string;
  serviceName: string;
  apiName: string;
  name: string;
  displayName: string;
  method: string;
  urlTemplate: string;
  properties?: Record<string, unknown>;
  created: string;
  updated: string;
}

const services = new PersistentMap<string, ApiManagementService>('azure-apim-services');
const apis = new PersistentMap<string, ApiManagementApi>('azure-apim-apis');
const operations = new PersistentMap<string, ApiManagementOperation>('azure-apim-operations');

function serviceKey(serviceName: string): string {
  return serviceName.toLowerCase();
}

function apiKey(serviceName: string, apiName: string): string {
  return `${serviceName.toLowerCase()}\0${apiName.toLowerCase()}`;
}

function operationKey(serviceName: string, apiName: string, operationName: string): string {
  return `${serviceName.toLowerCase()}\0${apiName.toLowerCase()}\0${operationName.toLowerCase()}`;
}

function serviceNameFromHost(req: AzureParsedRequest): string {
  const match = req.azureHost.match(/^([^.]+)\.azure-api\.net$/i);
  return match ? match[1] : API_MANAGEMENT_SERVICE;
}

function gatewayUrl(serviceName: string): string {
  return `https://${serviceName}.azure-api.net`;
}

function serviceArmId(serviceName: string): string {
  return `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/mockcloud/providers/Microsoft.ApiManagement/service/${serviceName}`;
}

function apiArmId(serviceName: string, apiName: string): string {
  return `${services.get(serviceKey(serviceName))?.id ?? serviceArmId(serviceName)}/apis/${apiName}`;
}

function operationArmId(serviceName: string, apiName: string, operationName: string): string {
  return `${apis.get(apiKey(serviceName, apiName))?.id ?? apiArmId(serviceName, apiName)}/operations/${operationName}`;
}

function pathParts(req: AzureParsedRequest): string[] {
  return req.azurePath.split('/').filter(Boolean).map(decodeURIComponent);
}

function normalizeRoutePath(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function normalizeTemplate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') return '/';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
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

function apimError(code: string, message: string, statusCode: number): ApiResponse {
  return jsonResponse({ error: { code, message } }, statusCode);
}

function ensureService(serviceName: string): ApiManagementService {
  const existing = services.get(serviceKey(serviceName));
  if (existing) return existing;
  const now = new Date().toISOString();
  const service: ApiManagementService = {
    id: serviceArmId(serviceName),
    name: serviceName,
    location: LOCATION,
    gatewayUrl: gatewayUrl(serviceName),
    properties: {
      provisioningState: 'Succeeded',
      gatewayUrl: gatewayUrl(serviceName),
    },
    created: now,
    updated: now,
  };
  services.set(serviceKey(serviceName), service);
  return service;
}

export function createApiManagementServiceFromArm(input: {
  id: string;
  name: string;
  location?: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
  sku?: unknown;
}): void {
  const existing = services.get(serviceKey(input.name));
  const now = new Date().toISOString();
  const gateway = typeof input.properties?.gatewayUrl === 'string'
    ? input.properties.gatewayUrl
    : gatewayUrl(input.name);
  services.set(serviceKey(input.name), {
    id: input.id,
    name: input.name,
    location: input.location ?? existing?.location ?? LOCATION,
    gatewayUrl: gateway,
    tags: input.tags ?? existing?.tags,
    sku: input.sku ?? existing?.sku,
    properties: {
      provisioningState: 'Succeeded',
      gatewayUrl: gateway,
      ...(existing?.properties ?? {}),
      ...(input.properties ?? {}),
    },
    created: existing?.created ?? now,
    updated: now,
  });
}

export function deleteApiManagementServiceFromArm(serviceName: string): void {
  services.delete(serviceKey(serviceName));
  for (const api of Array.from(apis.values())) {
    if (api.serviceName.toLowerCase() === serviceName.toLowerCase()) {
      apis.delete(apiKey(api.serviceName, api.name));
    }
  }
  for (const operation of Array.from(operations.values())) {
    if (operation.serviceName.toLowerCase() === serviceName.toLowerCase()) {
      operations.delete(operationKey(operation.serviceName, operation.apiName, operation.name));
    }
  }
}

export function createApiManagementApiFromArm(input: {
  id: string;
  serviceName: string;
  name: string;
  properties?: Record<string, unknown>;
}): void {
  ensureService(input.serviceName);
  upsertApi(input.serviceName, input.name, {
    id: input.id,
    properties: input.properties,
  });
}

export function deleteApiManagementApiFromArm(serviceName: string, apiName: string): void {
  apis.delete(apiKey(serviceName, apiName));
  for (const operation of Array.from(operations.values())) {
    if (operation.serviceName.toLowerCase() === serviceName.toLowerCase() &&
      operation.apiName.toLowerCase() === apiName.toLowerCase()) {
      operations.delete(operationKey(operation.serviceName, operation.apiName, operation.name));
    }
  }
}

export function createApiManagementOperationFromArm(input: {
  id: string;
  serviceName: string;
  apiName: string;
  name: string;
  properties?: Record<string, unknown>;
}): void {
  ensureService(input.serviceName);
  if (!apis.has(apiKey(input.serviceName, input.apiName))) {
    upsertApi(input.serviceName, input.apiName, {});
  }
  upsertOperation(input.serviceName, input.apiName, input.name, {
    id: input.id,
    properties: input.properties,
  });
}

export function deleteApiManagementOperationFromArm(serviceName: string, apiName: string, operationName: string): void {
  operations.delete(operationKey(serviceName, apiName, operationName));
}

function upsertApi(
  serviceName: string,
  apiName: string,
  input: {
    id?: string;
    path?: string;
    displayName?: string;
    protocols?: string[];
    serviceUrl?: string;
    properties?: Record<string, unknown>;
  },
): ApiManagementApi {
  const existing = apis.get(apiKey(serviceName, apiName));
  const now = new Date().toISOString();
  const properties = input.properties ?? existing?.properties ?? {};
  const rawPath = input.path ??
    (typeof properties.path === 'string' ? properties.path : undefined) ??
    existing?.path ??
    apiName;
  const protocols = input.protocols ??
    (Array.isArray(properties.protocols) ? properties.protocols.map(String) : undefined) ??
    existing?.protocols ??
    ['https'];
  const api: ApiManagementApi = {
    id: input.id ?? existing?.id ?? apiArmId(serviceName, apiName),
    serviceName,
    name: apiName,
    path: normalizeRoutePath(rawPath),
    displayName: input.displayName ??
      (typeof properties.displayName === 'string' ? properties.displayName : undefined) ??
      existing?.displayName ??
      apiName,
    protocols,
    serviceUrl: input.serviceUrl ??
      (typeof properties.serviceUrl === 'string' ? properties.serviceUrl : undefined) ??
      existing?.serviceUrl,
    properties,
    created: existing?.created ?? now,
    updated: now,
  };
  apis.set(apiKey(serviceName, apiName), api);
  return api;
}

function upsertOperation(
  serviceName: string,
  apiName: string,
  operationName: string,
  input: {
    id?: string;
    displayName?: string;
    method?: string;
    urlTemplate?: string;
    properties?: Record<string, unknown>;
  },
): ApiManagementOperation {
  const existing = operations.get(operationKey(serviceName, apiName, operationName));
  const now = new Date().toISOString();
  const properties = input.properties ?? existing?.properties ?? {};
  const operation: ApiManagementOperation = {
    id: input.id ?? existing?.id ?? operationArmId(serviceName, apiName, operationName),
    serviceName,
    apiName,
    name: operationName,
    displayName: input.displayName ??
      (typeof properties.displayName === 'string' ? properties.displayName : undefined) ??
      existing?.displayName ??
      operationName,
    method: (input.method ??
      (typeof properties.method === 'string' ? properties.method : undefined) ??
      existing?.method ??
      'GET').toUpperCase(),
    urlTemplate: normalizeTemplate(input.urlTemplate ??
      (typeof properties.urlTemplate === 'string' ? properties.urlTemplate : undefined) ??
      existing?.urlTemplate ??
      '/'),
    properties,
    created: existing?.created ?? now,
    updated: now,
  };
  operations.set(operationKey(serviceName, apiName, operationName), operation);
  return operation;
}

function apiEnvelope(api: ApiManagementApi): Record<string, unknown> {
  return {
    id: api.id,
    name: api.name,
    type: 'Microsoft.ApiManagement/service/apis',
    properties: {
      displayName: api.displayName,
      path: api.path,
      protocols: api.protocols,
      serviceUrl: api.serviceUrl,
      provisioningState: 'Succeeded',
      ...(api.properties ?? {}),
    },
  };
}

function operationEnvelope(operation: ApiManagementOperation): Record<string, unknown> {
  return {
    id: operation.id,
    name: operation.name,
    type: 'Microsoft.ApiManagement/service/apis/operations',
    properties: {
      displayName: operation.displayName,
      method: operation.method,
      urlTemplate: operation.urlTemplate,
      provisioningState: 'Succeeded',
      ...(operation.properties ?? {}),
    },
  };
}

function listApis(req: AzureParsedRequest): ApiResponse {
  const serviceName = serviceNameFromHost(req);
  ensureService(serviceName);
  const value = Array.from(apis.values())
    .filter((api) => api.serviceName.toLowerCase() === serviceName.toLowerCase())
    .map(apiEnvelope);
  return jsonResponse({ value });
}

function getApi(req: AzureParsedRequest, apiName: string): ApiResponse {
  const serviceName = serviceNameFromHost(req);
  const api = apis.get(apiKey(serviceName, apiName));
  if (!api) return apimError('ApiNotFound', `API '${apiName}' was not found.`, 404);
  return jsonResponse(apiEnvelope(api));
}

function putApi(req: AzureParsedRequest, apiName: string): ApiResponse {
  const serviceName = serviceNameFromHost(req);
  ensureService(serviceName);
  const body = req.body as Record<string, unknown>;
  const properties = body.properties && typeof body.properties === 'object' && !Array.isArray(body.properties)
    ? body.properties as Record<string, unknown>
    : body;
  const api = upsertApi(serviceName, apiName, {
    path: typeof properties.path === 'string' ? properties.path : undefined,
    displayName: typeof properties.displayName === 'string' ? properties.displayName : undefined,
    protocols: Array.isArray(properties.protocols) ? properties.protocols.map(String) : undefined,
    serviceUrl: typeof properties.serviceUrl === 'string' ? properties.serviceUrl : undefined,
    properties,
  });
  return jsonResponse(apiEnvelope(api), 201);
}

function deleteApi(req: AzureParsedRequest, apiName: string): ApiResponse {
  const serviceName = serviceNameFromHost(req);
  deleteApiManagementApiFromArm(serviceName, apiName);
  return noContent();
}

function listOperations(req: AzureParsedRequest, apiName: string): ApiResponse {
  const serviceName = serviceNameFromHost(req);
  const value = Array.from(operations.values())
    .filter((operation) =>
      operation.serviceName.toLowerCase() === serviceName.toLowerCase() &&
      operation.apiName.toLowerCase() === apiName.toLowerCase())
    .map(operationEnvelope);
  return jsonResponse({ value });
}

function putOperation(req: AzureParsedRequest, apiName: string, operationName: string): ApiResponse {
  const serviceName = serviceNameFromHost(req);
  ensureService(serviceName);
  if (!apis.has(apiKey(serviceName, apiName))) {
    upsertApi(serviceName, apiName, {});
  }
  const body = req.body as Record<string, unknown>;
  const properties = body.properties && typeof body.properties === 'object' && !Array.isArray(body.properties)
    ? body.properties as Record<string, unknown>
    : body;
  const operation = upsertOperation(serviceName, apiName, operationName, {
    displayName: typeof properties.displayName === 'string' ? properties.displayName : undefined,
    method: typeof properties.method === 'string' ? properties.method : undefined,
    urlTemplate: typeof properties.urlTemplate === 'string' ? properties.urlTemplate : undefined,
    properties,
  });
  return jsonResponse(operationEnvelope(operation), 201);
}

function deleteOperation(req: AzureParsedRequest, apiName: string, operationName: string): ApiResponse {
  const serviceName = serviceNameFromHost(req);
  deleteApiManagementOperationFromArm(serviceName, apiName, operationName);
  return noContent();
}

function routeSegments(api: ApiManagementApi, operation: ApiManagementOperation): string[] {
  const prefix = normalizeRoutePath(api.path);
  const template = normalizeRoutePath(operation.urlTemplate);
  return [prefix, template].filter(Boolean).join('/').split('/').filter(Boolean);
}

function operationMatches(api: ApiManagementApi, operation: ApiManagementOperation, req: AzureParsedRequest): boolean {
  if (operation.method !== '*' && operation.method !== req.method.toUpperCase()) return false;
  const expected = routeSegments(api, operation);
  const actual = pathParts(req);
  if (expected.length !== actual.length) return false;
  return expected.every((segment, index) => {
    if (segment.startsWith('{') && segment.endsWith('}')) return true;
    return segment.toLowerCase() === actual[index].toLowerCase();
  });
}

function invocationInput(req: AzureParsedRequest): unknown {
  if (Object.keys(req.body).length > 0) return req.body;
  if (req.rawBody.length > 0) return req.rawBody.toString('utf-8');
  return {};
}

function invokeGateway(req: AzureParsedRequest): ApiResponse {
  const serviceName = serviceNameFromHost(req);
  ensureService(serviceName);
  for (const api of Array.from(apis.values())) {
    if (api.serviceName.toLowerCase() !== serviceName.toLowerCase()) continue;
    for (const operation of Array.from(operations.values())) {
      if (operation.serviceName.toLowerCase() !== serviceName.toLowerCase()) continue;
      if (operation.apiName.toLowerCase() !== api.name.toLowerCase()) continue;
      if (!operationMatches(api, operation, req)) continue;
      return jsonResponse({
        requestId: randomUUID(),
        serviceName,
        apiName: api.name,
        operationName: operation.name,
        method: req.method,
        path: req.azurePath,
        query: req.queryParams,
        input: invocationInput(req),
      });
    }
  }
  return apimError('OperationNotFound', 'No API Management operation matched the request.', 404);
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  const [root, apiName, operationsRoot, operationName] = pathParts(req);

  if (root === 'apis' && !apiName && req.method === 'GET') return listApis(req);
  if (root === 'apis' && apiName && !operationsRoot) {
    if (req.method === 'GET') return getApi(req, apiName);
    if (req.method === 'PUT') return putApi(req, apiName);
    if (req.method === 'DELETE') return deleteApi(req, apiName);
  }
  if (root === 'apis' && apiName && operationsRoot === 'operations' && !operationName && req.method === 'GET') {
    return listOperations(req, apiName);
  }
  if (root === 'apis' && apiName && operationsRoot === 'operations' && operationName) {
    if (req.method === 'PUT') return putOperation(req, apiName, operationName);
    if (req.method === 'DELETE') return deleteOperation(req, apiName, operationName);
  }
  if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return invokeGateway(req);
  }
  return apimError('BadRequest', 'The requested API Management operation is not supported by MockCloud.', 400);
}

export const azureApiManagementService: AzureServiceDefinition = {
  name: 'azure-api-management',
  hostPatterns: ['*.azure-api.net'],
  handlers: {
    _default: routeRequest,
  },
};
