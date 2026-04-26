import { createHash, randomUUID } from 'node:crypto';
import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';
import { requestProtocol } from '../../request-url.js';
import { PersistentMap } from '../../../state/store.js';
import { COSMOS_ACCOUNT } from '../../config.js';

interface CosmosDatabase {
  account: string;
  id: string;
  rid: string;
  etag: string;
  ts: number;
}

interface CosmosContainer {
  account: string;
  databaseId: string;
  id: string;
  partitionKey: {
    paths: string[];
    kind?: string;
    version?: number;
  };
  indexingPolicy?: Record<string, unknown>;
  rid: string;
  etag: string;
  ts: number;
}

interface CosmosDocument {
  account: string;
  databaseId: string;
  containerId: string;
  id: string;
  body: Record<string, unknown>;
  rid: string;
  etag: string;
  ts: number;
}

const databases = new PersistentMap<string, CosmosDatabase>('azure-cosmos-databases');
const containers = new PersistentMap<string, CosmosContainer>('azure-cosmos-containers');
const documents = new PersistentMap<string, CosmosDocument>('azure-cosmos-documents');

function accountName(req: AzureParsedRequest): string {
  const match = req.azureHost.match(/^([^.]+)\.documents\.azure\.com$/i);
  return match ? match[1] : COSMOS_ACCOUNT;
}

function pathParts(req: AzureParsedRequest): string[] {
  return req.azurePath.split('/').filter(Boolean).map(decodeURIComponent);
}

function databaseKey(account: string, databaseId: string): string {
  return `${account}\0${databaseId}`;
}

function containerKey(account: string, databaseId: string, containerId: string): string {
  return `${account}\0${databaseId}\0${containerId}`;
}

function documentKey(account: string, databaseId: string, containerId: string, documentId: string): string {
  return `${account}\0${databaseId}\0${containerId}\0${documentId}`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function ridFor(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest().subarray(0, 8).toString('base64');
}

function etagFor(...parts: string[]): string {
  return `"${createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32)}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonResponse(data: unknown, statusCode = 200, headers: Record<string, string> = {}): ApiResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'x-ms-activity-id': randomUUID(),
      'x-ms-request-charge': '1',
      'x-ms-session-token': '0:1#1',
      ...headers,
    },
    body: JSON.stringify(data),
  };
}

function cosmosNoContent(headers: Record<string, string> = {}): ApiResponse {
  return {
    statusCode: 204,
    headers: {
      'Content-Type': 'application/json',
      'x-ms-activity-id': randomUUID(),
      'x-ms-request-charge': '1',
      'x-ms-session-token': '0:1#1',
      ...headers,
    },
    body: '',
  };
}

function cosmosError(code: string, message: string, statusCode: number): ApiResponse {
  return jsonResponse({ code, message }, statusCode);
}

function dbResource(database: CosmosDatabase): Record<string, unknown> {
  return {
    id: database.id,
    _rid: database.rid,
    _self: `dbs/${database.id}/`,
    _etag: database.etag,
    _colls: 'colls/',
    _users: 'users/',
    _ts: database.ts,
  };
}

function containerResource(container: CosmosContainer): Record<string, unknown> {
  return {
    id: container.id,
    indexingPolicy: container.indexingPolicy ?? {
      indexingMode: 'consistent',
      automatic: true,
      includedPaths: [{ path: '/*' }],
      excludedPaths: [{ path: '/"_etag"/?' }],
    },
    partitionKey: container.partitionKey,
    _rid: container.rid,
    _self: `dbs/${container.databaseId}/colls/${container.id}/`,
    _etag: container.etag,
    _docs: 'docs/',
    _sprocs: 'sprocs/',
    _triggers: 'triggers/',
    _udfs: 'udfs/',
    _conflicts: 'conflicts/',
    _ts: container.ts,
  };
}

function documentResource(document: CosmosDocument): Record<string, unknown> {
  return {
    ...document.body,
    id: document.id,
    _rid: document.rid,
    _self: `dbs/${document.databaseId}/colls/${document.containerId}/docs/${document.id}/`,
    _etag: document.etag,
    _attachments: 'attachments/',
    _ts: document.ts,
  };
}

function containerHeaders(container: CosmosContainer, count?: number): Record<string, string> {
  const headers: Record<string, string> = {
    'x-ms-content-path': container.rid,
    'x-ms-alt-content-path': `dbs/${container.databaseId}/colls/${container.id}`,
  };
  if (count !== undefined) {
    headers['x-ms-item-count'] = String(count);
  }
  return headers;
}

function getDatabase(account: string, databaseId: string): CosmosDatabase | undefined {
  return databases.get(databaseKey(account, databaseId));
}

function getContainer(account: string, databaseId: string, containerId: string): CosmosContainer | undefined {
  return containers.get(containerKey(account, databaseId, containerId));
}

function requireDatabase(account: string, databaseId: string): CosmosDatabase | ApiResponse {
  const database = getDatabase(account, databaseId);
  return database ?? cosmosError('NotFound', `Database ${databaseId} was not found.`, 404);
}

function requireContainer(account: string, databaseId: string, containerId: string): CosmosContainer | ApiResponse {
  const database = requireDatabase(account, databaseId);
  if ('statusCode' in database) return database;
  const container = getContainer(account, databaseId, containerId);
  return container ?? cosmosError('NotFound', `Container ${containerId} was not found.`, 404);
}

function listDatabases(account: string): CosmosDatabase[] {
  return Array.from(databases.values()).filter((database) => database.account === account);
}

function listContainers(account: string, databaseId: string): CosmosContainer[] {
  return Array.from(containers.values())
    .filter((container) => container.account === account && container.databaseId === databaseId);
}

function listDocuments(account: string, databaseId: string, containerId: string): CosmosDocument[] {
  return Array.from(documents.values())
    .filter((document) =>
      document.account === account &&
      document.databaseId === databaseId &&
      document.containerId === containerId);
}

export function createCosmosDatabaseFromArm(input: {
  account: string;
  name: string;
  properties?: Record<string, unknown>;
}): void {
  const resource = isRecord(input.properties?.resource) ? input.properties.resource : {};
  const id = typeof resource.id === 'string' ? resource.id : input.name;
  const existing = getDatabase(input.account, id);
  const ts = nowSeconds();
  databases.set(databaseKey(input.account, id), {
    account: input.account,
    id,
    rid: existing?.rid ?? ridFor(input.account, id),
    etag: etagFor(input.account, id, String(ts)),
    ts,
  });
}

export function createCosmosContainerFromArm(input: {
  account: string;
  databaseId: string;
  name: string;
  properties?: Record<string, unknown>;
}): void {
  const resource = isRecord(input.properties?.resource) ? input.properties.resource : {};
  const requestedPartitionKey = isRecord(resource.partitionKey) ? resource.partitionKey : undefined;
  const paths = Array.isArray(requestedPartitionKey?.paths)
    ? requestedPartitionKey.paths.filter((path): path is string => typeof path === 'string')
    : ['/id'];
  const id = typeof resource.id === 'string' ? resource.id : input.name;
  const existing = getContainer(input.account, input.databaseId, id);
  const ts = nowSeconds();
  containers.set(containerKey(input.account, input.databaseId, id), {
    account: input.account,
    databaseId: input.databaseId,
    id,
    partitionKey: {
      paths: paths.length > 0 ? paths : ['/id'],
      kind: typeof requestedPartitionKey?.kind === 'string' ? requestedPartitionKey.kind : 'Hash',
      version: typeof requestedPartitionKey?.version === 'number' ? requestedPartitionKey.version : 2,
    },
    indexingPolicy: isRecord(resource.indexingPolicy) ? resource.indexingPolicy : undefined,
    rid: existing?.rid ?? ridFor(input.account, input.databaseId, id),
    etag: etagFor(input.account, input.databaseId, id, String(ts)),
    ts,
  });
}

export function deleteCosmosDatabaseFromArm(account: string, databaseId: string): void {
  deleteDatabase(account, databaseId);
}

export function deleteCosmosContainerFromArm(account: string, databaseId: string, containerId: string): void {
  deleteContainer(account, databaseId, containerId);
}

function createDatabase(account: string, req: AzureParsedRequest): ApiResponse {
  const id = typeof req.body.id === 'string' ? req.body.id : '';
  if (!id) return cosmosError('BadRequest', 'Database id is required.', 400);
  if (getDatabase(account, id)) return cosmosError('Conflict', `Database ${id} already exists.`, 409);

  const ts = nowSeconds();
  const database: CosmosDatabase = {
    account,
    id,
    rid: ridFor(account, id),
    etag: etagFor(account, id, String(ts)),
    ts,
  };
  databases.set(databaseKey(account, id), database);
  return jsonResponse(dbResource(database), 201, { etag: database.etag });
}

function readDatabase(account: string, databaseId: string): ApiResponse {
  const database = requireDatabase(account, databaseId);
  if ('statusCode' in database) return database;
  return jsonResponse(dbResource(database), 200, { etag: database.etag });
}

function deleteDatabase(account: string, databaseId: string): ApiResponse {
  const database = requireDatabase(account, databaseId);
  if ('statusCode' in database) return database;

  for (const container of listContainers(account, databaseId)) {
    for (const document of listDocuments(account, databaseId, container.id)) {
      documents.delete(documentKey(account, databaseId, container.id, document.id));
    }
    containers.delete(containerKey(account, databaseId, container.id));
  }
  databases.delete(databaseKey(account, databaseId));
  return cosmosNoContent();
}

function listDatabaseResources(account: string): ApiResponse {
  const items = listDatabases(account).map(dbResource);
  return jsonResponse({ _rid: '', Databases: items, _count: items.length }, 200, { 'x-ms-item-count': String(items.length) });
}

function createContainer(account: string, databaseId: string, req: AzureParsedRequest): ApiResponse {
  const database = requireDatabase(account, databaseId);
  if ('statusCode' in database) return database;

  const id = typeof req.body.id === 'string' ? req.body.id : '';
  if (!id) return cosmosError('BadRequest', 'Container id is required.', 400);
  if (getContainer(account, databaseId, id)) return cosmosError('Conflict', `Container ${id} already exists.`, 409);

  const requestedPartitionKey = req.body.partitionKey as { paths?: unknown; kind?: string; version?: number } | undefined;
  const paths = Array.isArray(requestedPartitionKey?.paths)
    ? requestedPartitionKey.paths.filter((path): path is string => typeof path === 'string')
    : ['/id'];
  const ts = nowSeconds();
  const container: CosmosContainer = {
    account,
    databaseId,
    id,
    partitionKey: {
      paths: paths.length > 0 ? paths : ['/id'],
      kind: requestedPartitionKey?.kind ?? 'Hash',
      version: requestedPartitionKey?.version ?? 2,
    },
    indexingPolicy: req.body.indexingPolicy as Record<string, unknown> | undefined,
    rid: ridFor(account, databaseId, id),
    etag: etagFor(account, databaseId, id, String(ts)),
    ts,
  };
  containers.set(containerKey(account, databaseId, id), container);
  return jsonResponse(containerResource(container), 201, {
    etag: container.etag,
    ...containerHeaders(container),
  });
}

function readContainer(account: string, databaseId: string, containerId: string): ApiResponse {
  const container = requireContainer(account, databaseId, containerId);
  if ('statusCode' in container) return container;
  return jsonResponse(containerResource(container), 200, {
    etag: container.etag,
    ...containerHeaders(container),
  });
}

function replaceContainer(account: string, databaseId: string, containerId: string, req: AzureParsedRequest): ApiResponse {
  const existing = requireContainer(account, databaseId, containerId);
  if ('statusCode' in existing) return existing;

  const requestedPartitionKey = req.body.partitionKey as { paths?: unknown; kind?: string; version?: number } | undefined;
  const paths = Array.isArray(requestedPartitionKey?.paths)
    ? requestedPartitionKey.paths.filter((path): path is string => typeof path === 'string')
    : existing.partitionKey.paths;
  const ts = nowSeconds();
  const next: CosmosContainer = {
    ...existing,
    partitionKey: {
      paths: paths.length > 0 ? paths : existing.partitionKey.paths,
      kind: requestedPartitionKey?.kind ?? existing.partitionKey.kind,
      version: requestedPartitionKey?.version ?? existing.partitionKey.version,
    },
    indexingPolicy: req.body.indexingPolicy as Record<string, unknown> | undefined,
    etag: etagFor(existing.account, existing.databaseId, existing.id, String(ts)),
    ts,
  };
  containers.set(containerKey(account, databaseId, containerId), next);
  return jsonResponse(containerResource(next), 200, {
    etag: next.etag,
    ...containerHeaders(next),
  });
}

function deleteContainer(account: string, databaseId: string, containerId: string): ApiResponse {
  const container = requireContainer(account, databaseId, containerId);
  if ('statusCode' in container) return container;

  for (const document of listDocuments(account, databaseId, containerId)) {
    documents.delete(documentKey(account, databaseId, containerId, document.id));
  }
  containers.delete(containerKey(account, databaseId, containerId));
  return cosmosNoContent(containerHeaders(container));
}

function listContainerResources(account: string, databaseId: string): ApiResponse {
  const database = requireDatabase(account, databaseId);
  if ('statusCode' in database) return database;
  const items = listContainers(account, databaseId).map(containerResource);
  return jsonResponse({ _rid: database.rid, DocumentCollections: items, _count: items.length }, 200, { 'x-ms-item-count': String(items.length) });
}

function itemIdFromBody(body: Record<string, unknown>): string {
  return typeof body.id === 'string' ? body.id : randomUUID();
}

function createOrReplaceDocument(
  account: string,
  databaseId: string,
  containerId: string,
  req: AzureParsedRequest,
  statusCode: number,
): ApiResponse {
  const container = requireContainer(account, databaseId, containerId);
  if ('statusCode' in container) return container;

  const body = { ...req.body };
  const id = itemIdFromBody(body);
  body.id = id;
  const ts = nowSeconds();
  const document: CosmosDocument = {
    account,
    databaseId,
    containerId,
    id,
    body,
    rid: ridFor(account, databaseId, containerId, id),
    etag: etagFor(account, databaseId, containerId, id, JSON.stringify(body), String(ts)),
    ts,
  };
  documents.set(documentKey(account, databaseId, containerId, id), document);
  return jsonResponse(documentResource(document), statusCode, {
    etag: document.etag,
    ...containerHeaders(container),
  });
}

function readDocument(account: string, databaseId: string, containerId: string, documentId: string): ApiResponse {
  const container = requireContainer(account, databaseId, containerId);
  if ('statusCode' in container) return container;
  const document = documents.get(documentKey(account, databaseId, containerId, documentId));
  if (!document) return cosmosError('NotFound', `Item ${documentId} was not found.`, 404);
  return jsonResponse(documentResource(document), 200, {
    etag: document.etag,
    ...containerHeaders(container),
  });
}

function replaceDocument(account: string, databaseId: string, containerId: string, documentId: string, req: AzureParsedRequest): ApiResponse {
  const existing = documents.get(documentKey(account, databaseId, containerId, documentId));
  if (!existing) return cosmosError('NotFound', `Item ${documentId} was not found.`, 404);
  const body = { ...req.body, id: documentId };
  req.body = body;
  return createOrReplaceDocument(account, databaseId, containerId, req, 200);
}

function patchDocument(account: string, databaseId: string, containerId: string, documentId: string, req: AzureParsedRequest): ApiResponse {
  const container = requireContainer(account, databaseId, containerId);
  if ('statusCode' in container) return container;
  const existing = documents.get(documentKey(account, databaseId, containerId, documentId));
  if (!existing) return cosmosError('NotFound', `Item ${documentId} was not found.`, 404);

  const body = req.body as Record<string, unknown>;
  const operations = Array.isArray(body.operations) ? body.operations : [];
  const next: Record<string, unknown> = { ...(existing.body as Record<string, unknown>) };

  for (const raw of operations) {
    if (!raw || typeof raw !== 'object') continue;
    const op = raw as { op?: string; path?: string; value?: unknown };
    if (typeof op.path !== 'string' || !op.path.startsWith('/')) continue;
    const key = op.path.slice(1);
    const current = next[key];
    switch ((op.op ?? '').toLowerCase()) {
      case 'add':
      case 'set':
      case 'replace':
        next[key] = op.value;
        break;
      case 'remove':
        delete next[key];
        break;
      case 'incr':
      case 'increment': {
        const delta = typeof op.value === 'number' ? op.value : 0;
        const base = typeof current === 'number' ? current : 0;
        next[key] = base + delta;
        break;
      }
      default:
        break;
    }
  }

  req.body = next;
  return createOrReplaceDocument(account, databaseId, containerId, req, 200);
}

function deleteDocument(account: string, databaseId: string, containerId: string, documentId: string): ApiResponse {
  const container = requireContainer(account, databaseId, containerId);
  if ('statusCode' in container) return container;
  if (!documents.delete(documentKey(account, databaseId, containerId, documentId))) {
    return cosmosError('NotFound', `Item ${documentId} was not found.`, 404);
  }
  return cosmosNoContent(containerHeaders(container));
}

function listDocumentResources(account: string, databaseId: string, containerId: string): ApiResponse {
  const container = requireContainer(account, databaseId, containerId);
  if ('statusCode' in container) return container;
  const items = listDocuments(account, databaseId, containerId).map(documentResource);
  return jsonResponse({ _rid: container.rid, Documents: items, _count: items.length }, 200, containerHeaders(container, items.length));
}

function parameterValue(req: AzureParsedRequest, name: string): unknown {
  const parameters = (req.body as { parameters?: Array<{ name?: string; value?: unknown }> }).parameters;
  return parameters?.find((parameter) => parameter.name?.toLowerCase() === name.toLowerCase())?.value;
}

function literalValue(value: string): unknown {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;
  if (trimmed.toLowerCase() === 'null') return null;
  return trimmed;
}

function queryMatches(document: Record<string, unknown>, req: AzureParsedRequest): boolean {
  const query = typeof req.body.query === 'string' ? req.body.query : '';
  const whereMatch = query.match(/\bwhere\s+(.+?)(?:\s+(?:order\s+by|group\s+by|offset|limit)\b|$)/i);
  if (!whereMatch) return true;

  const conjuncts = whereMatch[1].split(/\s+and\s+/i);
  return conjuncts.every((clause) => evaluateClause(document, clause.trim(), req));
}

function evaluateClause(document: Record<string, unknown>, clause: string, req: AzureParsedRequest): boolean {
  const equalityMatch = clause.match(/^(?:\w+\.)?([A-Za-z_][\w-]*)\s*(=|!=|<>|>=|<=|>|<)\s*(.+)$/i);
  if (!equalityMatch) return true;

  const [, field, operator, rawExpected] = equalityMatch;
  const trimmed = rawExpected.trim();
  const expected = trimmed.startsWith('@')
    ? parameterValue(req, trimmed)
    : literalValue(trimmed);
  const actual = document[field];
  switch (operator) {
    case '=': return actual === expected;
    case '!=':
    case '<>': return actual !== expected;
    case '>': return compareValues(actual, expected) > 0;
    case '>=': return compareValues(actual, expected) >= 0;
    case '<': return compareValues(actual, expected) < 0;
    case '<=': return compareValues(actual, expected) <= 0;
    default: return true;
  }
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function queryDocuments(account: string, databaseId: string, containerId: string, req: AzureParsedRequest): ApiResponse {
  const container = requireContainer(account, databaseId, containerId);
  if ('statusCode' in container) return container;
  const items = listDocuments(account, databaseId, containerId)
    .map(documentResource)
    .filter((document) => queryMatches(document, req));
  return jsonResponse({ _rid: container.rid, Documents: items, _count: items.length }, 200, containerHeaders(container, items.length));
}

function listPartitionKeyRanges(account: string, databaseId: string, containerId: string): ApiResponse {
  const container = requireContainer(account, databaseId, containerId);
  if ('statusCode' in container) return container;
  const ranges = [{
    id: '0',
    _rid: ridFor(account, databaseId, containerId, 'pkrange-0'),
    _self: `dbs/${databaseId}/colls/${containerId}/pkranges/0/`,
    minInclusive: '',
    maxExclusive: 'FF',
  }];
  return jsonResponse({ _rid: container.rid, PartitionKeyRanges: ranges, _count: ranges.length }, 200, containerHeaders(container, ranges.length));
}

function databaseAccount(req: AzureParsedRequest): ApiResponse {
  const requestHost = req.headers.host ?? req.azureHost;
  const proxyPrefix = req.path.startsWith('/azure/') ? `/azure/${req.azureHost}` : '';
  const endpoint = `${requestProtocol(req)}://${requestHost}${proxyPrefix}`;
  return jsonResponse({
    id: accountName(req),
    _self: '',
    writableLocations: [{ name: 'East US', databaseAccountEndpoint: endpoint }],
    readableLocations: [{ name: 'East US', databaseAccountEndpoint: endpoint }],
    userConsistencyPolicy: { defaultConsistencyLevel: 'Session' },
    enableMultipleWritableLocations: false,
  }, 200, {
    'x-ms-max-media-storage-usage-mb': '1024',
    'x-ms-media-storage-usage-mb': '0',
  });
}

function isQuery(req: AzureParsedRequest): boolean {
  if (req.headers['x-ms-documentdb-isquery']?.toLowerCase() === 'true') return true;
  const contentType = req.headers['content-type']?.toLowerCase() ?? '';
  if (contentType.includes('application/query+json')) return true;
  const body = req.body as Record<string, unknown>;
  return typeof body?.query === 'string';
}

function isUpsert(req: AzureParsedRequest): boolean {
  return req.headers['x-ms-documentdb-is-upsert']?.toLowerCase() === 'true';
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  const account = accountName(req);
  const [root, databaseId, collection, containerId, childCollection, childId] = pathParts(req);

  if (!root && req.method === 'GET') return databaseAccount(req);

  if (root === 'dbs' && !databaseId) {
    if (req.method === 'GET') return listDatabaseResources(account);
    if (req.method === 'POST' && isQuery(req)) return listDatabaseResources(account);
    if (req.method === 'POST') return createDatabase(account, req);
  }

  if (root === 'dbs' && databaseId && !collection) {
    if (req.method === 'GET') return readDatabase(account, databaseId);
    if (req.method === 'DELETE') return deleteDatabase(account, databaseId);
  }

  if (root === 'dbs' && databaseId && collection === 'colls' && !containerId) {
    if (req.method === 'GET') return listContainerResources(account, databaseId);
    if (req.method === 'POST' && isQuery(req)) return listContainerResources(account, databaseId);
    if (req.method === 'POST') return createContainer(account, databaseId, req);
  }

  if (root === 'dbs' && databaseId && collection === 'colls' && containerId && !childCollection) {
    if (req.method === 'GET') return readContainer(account, databaseId, containerId);
    if (req.method === 'PUT') return replaceContainer(account, databaseId, containerId, req);
    if (req.method === 'DELETE') return deleteContainer(account, databaseId, containerId);
  }

  if (root === 'dbs' && databaseId && collection === 'colls' && containerId && childCollection === 'pkranges') {
    if (req.method === 'GET' || req.method === 'POST') return listPartitionKeyRanges(account, databaseId, containerId);
  }

  if (root === 'dbs' && databaseId && collection === 'colls' && containerId && childCollection === 'docs' && !childId) {
    if (req.method === 'GET') return listDocumentResources(account, databaseId, containerId);
    if (req.method === 'POST' && isQuery(req)) return queryDocuments(account, databaseId, containerId, req);
    if (req.method === 'POST' && isUpsert(req)) return createOrReplaceDocument(account, databaseId, containerId, req, 200);
    if (req.method === 'POST') return createOrReplaceDocument(account, databaseId, containerId, req, 201);
  }

  if (root === 'dbs' && databaseId && collection === 'colls' && containerId && childCollection === 'docs' && childId) {
    if (req.method === 'GET') return readDocument(account, databaseId, containerId, childId);
    if (req.method === 'PUT') return replaceDocument(account, databaseId, containerId, childId, req);
    if (req.method === 'PATCH') return patchDocument(account, databaseId, containerId, childId, req);
    if (req.method === 'DELETE') return deleteDocument(account, databaseId, containerId, childId);
  }

  return cosmosError('BadRequest', 'The requested Cosmos DB operation is not supported by MockCloud.', 400);
}

export const azureCosmosService: AzureServiceDefinition = {
  name: 'azure-cosmos',
  hostPatterns: ['*.documents.azure.com'],
  handlers: {
    _default: routeRequest,
  },
};
