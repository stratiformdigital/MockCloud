import { randomUUID } from 'node:crypto';
import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';
import { PersistentMap } from '../../../state/store.js';
import { LOCATION, SUBSCRIPTION_ID } from '../../config.js';

interface MonitorWorkspace {
  id: string;
  name: string;
  customerId: string;
  location: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
  created: string;
  updated: string;
}

interface MonitorTable {
  id: string;
  workspaceName: string;
  name: string;
  properties?: Record<string, unknown>;
  created: string;
  updated: string;
}

interface MonitorRecord {
  id: string;
  workspaceName: string;
  tableName: string;
  timeGenerated: string;
  data: Record<string, unknown>;
}

const workspaces = new PersistentMap<string, MonitorWorkspace>('azure-monitor-workspaces');
const tables = new PersistentMap<string, MonitorTable>('azure-monitor-tables');
const records = new PersistentMap<string, MonitorRecord[]>('azure-monitor-records');

function workspaceKey(workspaceName: string): string {
  return workspaceName.toLowerCase();
}

function tableKey(workspaceName: string, tableName: string): string {
  return `${workspaceName.toLowerCase()}\0${tableName.toLowerCase()}`;
}

function workspaceNameFromHost(req: AzureParsedRequest): string {
  const match = req.azureHost.match(/^([^.]+)\.ods\.opinsights\.azure\.com$/i);
  return match ? match[1] : 'mockworkspace';
}

function workspaceArmId(workspaceName: string): string {
  return `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/mockcloud/providers/Microsoft.OperationalInsights/workspaces/${workspaceName}`;
}

function tableArmId(workspaceName: string, tableName: string): string {
  return `${workspaces.get(workspaceKey(workspaceName))?.id ?? workspaceArmId(workspaceName)}/tables/${tableName}`;
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

function noContent(statusCode = 200): ApiResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: '',
  };
}

function monitorError(code: string, message: string, statusCode: number): ApiResponse {
  return jsonResponse({ error: { code, message } }, statusCode);
}

function ensureWorkspace(workspaceName: string): MonitorWorkspace {
  const existing = workspaces.get(workspaceKey(workspaceName));
  if (existing) return existing;
  const now = new Date().toISOString();
  const workspace: MonitorWorkspace = {
    id: workspaceArmId(workspaceName),
    name: workspaceName,
    customerId: workspaceName,
    location: LOCATION,
    properties: {
      provisioningState: 'Succeeded',
      customerId: workspaceName,
    },
    created: now,
    updated: now,
  };
  workspaces.set(workspaceKey(workspaceName), workspace);
  return workspace;
}

function findWorkspace(identifier: string): MonitorWorkspace {
  for (const workspace of workspaces.values()) {
    if (workspace.name.toLowerCase() === identifier.toLowerCase() ||
      workspace.customerId.toLowerCase() === identifier.toLowerCase()) {
      return workspace;
    }
  }
  return ensureWorkspace(identifier);
}

function ensureTable(workspaceName: string, tableName: string, properties?: Record<string, unknown>): MonitorTable {
  ensureWorkspace(workspaceName);
  const existing = tables.get(tableKey(workspaceName, tableName));
  const now = new Date().toISOString();
  const table: MonitorTable = {
    id: existing?.id ?? tableArmId(workspaceName, tableName),
    workspaceName,
    name: tableName,
    properties: {
      provisioningState: 'Succeeded',
      retentionInDays: 30,
      totalRetentionInDays: 30,
      ...(existing?.properties ?? {}),
      ...(properties ?? {}),
    },
    created: existing?.created ?? now,
    updated: now,
  };
  tables.set(tableKey(workspaceName, tableName), table);
  return table;
}

export function createLogAnalyticsWorkspaceFromArm(input: {
  id: string;
  name: string;
  location?: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
}): void {
  const existing = workspaces.get(workspaceKey(input.name));
  const now = new Date().toISOString();
  const customerId = typeof input.properties?.customerId === 'string'
    ? input.properties.customerId
    : existing?.customerId ?? input.name;
  workspaces.set(workspaceKey(input.name), {
    id: input.id,
    name: input.name,
    customerId,
    location: input.location ?? existing?.location ?? LOCATION,
    tags: input.tags ?? existing?.tags,
    properties: {
      provisioningState: 'Succeeded',
      customerId,
      ...(existing?.properties ?? {}),
      ...(input.properties ?? {}),
    },
    created: existing?.created ?? now,
    updated: now,
  });
}

export function deleteLogAnalyticsWorkspaceFromArm(workspaceName: string): void {
  workspaces.delete(workspaceKey(workspaceName));
  for (const table of Array.from(tables.values())) {
    if (table.workspaceName.toLowerCase() === workspaceName.toLowerCase()) {
      tables.delete(tableKey(table.workspaceName, table.name));
      records.delete(tableKey(table.workspaceName, table.name));
    }
  }
}

export function createLogAnalyticsTableFromArm(input: {
  id: string;
  workspaceName: string;
  name: string;
  properties?: Record<string, unknown>;
}): void {
  const table = ensureTable(input.workspaceName, input.name, input.properties);
  tables.set(tableKey(input.workspaceName, input.name), {
    ...table,
    id: input.id,
  });
}

export function deleteLogAnalyticsTableFromArm(workspaceName: string, tableName: string): void {
  tables.delete(tableKey(workspaceName, tableName));
  records.delete(tableKey(workspaceName, tableName));
}

function tableEnvelope(table: MonitorTable): Record<string, unknown> {
  return {
    id: table.id,
    name: table.name,
    type: 'Microsoft.OperationalInsights/workspaces/tables',
    properties: {
      ...table.properties,
      recordCount: (records.get(tableKey(table.workspaceName, table.name)) ?? []).length,
    },
  };
}

function normalizeRecord(workspaceName: string, tableName: string, item: unknown): MonitorRecord {
  const raw = item && typeof item === 'object' && !Array.isArray(item)
    ? item as Record<string, unknown>
    : { message: item };
  const timeGenerated = typeof raw.TimeGenerated === 'string'
    ? raw.TimeGenerated
    : typeof raw.timeGenerated === 'string'
      ? raw.timeGenerated
      : new Date().toISOString();
  return {
    id: randomUUID(),
    workspaceName,
    tableName,
    timeGenerated,
    data: raw,
  };
}

function ingestLogs(req: AzureParsedRequest): ApiResponse {
  const workspaceName = workspaceNameFromHost(req);
  const tableName = req.headers['log-type'] ?? req.headers['Log-Type'] ?? 'MockCloudLogs';
  ensureTable(workspaceName, tableName);
  const payload = req.body as unknown;
  const incoming = Array.isArray(payload) ? payload : [payload];
  const next = [
    ...(records.get(tableKey(workspaceName, tableName)) ?? []),
    ...incoming.map((item) => normalizeRecord(workspaceName, tableName, item)),
  ];
  records.set(tableKey(workspaceName, tableName), next);
  return noContent(200);
}

function listTables(req: AzureParsedRequest): ApiResponse {
  const workspaceName = workspaceNameFromHost(req);
  ensureWorkspace(workspaceName);
  const value = Array.from(tables.values())
    .filter((table) => table.workspaceName.toLowerCase() === workspaceName.toLowerCase())
    .map(tableEnvelope);
  return jsonResponse({ value });
}

function listRecords(req: AzureParsedRequest, tableName: string): ApiResponse {
  const workspaceName = workspaceNameFromHost(req);
  ensureTable(workspaceName, tableName);
  return jsonResponse({ value: records.get(tableKey(workspaceName, tableName)) ?? [] });
}

function queryTableName(query: string): string | null {
  const match = query.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/);
  return match ? match[1] : null;
}

function queryLimit(query: string): number {
  const match = query.match(/\|\s*(?:take|limit)\s+(\d+)/i);
  return match ? Number(match[1]) : 100;
}

function valueType(value: unknown): string {
  if (typeof value === 'number') return 'real';
  if (typeof value === 'boolean') return 'bool';
  if (value && typeof value === 'object') return 'dynamic';
  return 'string';
}

function queryLogs(req: AzureParsedRequest): ApiResponse {
  const [, , workspaceIdentifier] = pathParts(req);
  if (!workspaceIdentifier) return monitorError('BadRequest', 'Workspace id is required.', 400);
  const workspace = findWorkspace(workspaceIdentifier);
  const body = req.body as { query?: string };
  const query = body.query ?? '';
  const tableName = queryTableName(query);
  const allRecords = tableName
    ? records.get(tableKey(workspace.name, tableName)) ?? []
    : Array.from(records.values()).flat().filter((record) => record.workspaceName.toLowerCase() === workspace.name.toLowerCase());
  const selected = allRecords.slice(0, queryLimit(query));
  const keys = Array.from(new Set(selected.flatMap((record) => Object.keys(record.data))));
  const columns = [
    { name: 'TimeGenerated', type: 'datetime' },
    ...keys.map((key) => ({ name: key, type: valueType(selected.find((record) => record.data[key] !== undefined)?.data[key]) })),
  ];
  const rows = selected.map((record) => [
    record.timeGenerated,
    ...keys.map((key) => record.data[key] ?? null),
  ]);
  return jsonResponse({
    tables: [
      {
        name: 'PrimaryResult',
        columns,
        rows,
      },
    ],
  });
}

function routeOdsRequest(req: AzureParsedRequest): ApiResponse {
  const [root, second, tableName, fourth] = pathParts(req);
  if (root === 'api' && second === 'logs' && req.method === 'POST') return ingestLogs(req);
  if (root === 'api' && second === 'tables' && !tableName && req.method === 'GET') return listTables(req);
  if (root === 'api' && second === 'tables' && tableName && fourth === 'records' && req.method === 'GET') {
    return listRecords(req, tableName);
  }
  return monitorError('BadRequest', 'The requested Azure Monitor operation is not supported by MockCloud.', 400);
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  if (req.azureHost.toLowerCase() === 'api.loganalytics.io') {
    const [version, workspacesRoot, workspaceIdentifier, queryRoot] = pathParts(req);
    if (version === 'v1' && workspacesRoot === 'workspaces' && workspaceIdentifier && queryRoot === 'query' && req.method === 'POST') {
      return queryLogs(req);
    }
    return monitorError('BadRequest', 'The requested Log Analytics operation is not supported by MockCloud.', 400);
  }
  return routeOdsRequest(req);
}

export const azureMonitorService: AzureServiceDefinition = {
  name: 'azure-monitor',
  hostPatterns: ['*.ods.opinsights.azure.com', 'api.loganalytics.io'],
  handlers: {
    _default: routeRequest,
  },
};
