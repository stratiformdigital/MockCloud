import { createHash, randomUUID } from 'node:crypto';
import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';
import { PersistentMap } from '../../../state/store.js';
import { APP_CONFIG_ACCOUNT } from '../../config.js';

interface AppConfigurationSetting {
  account: string;
  key: string;
  label?: string;
  value?: string;
  contentType?: string;
  tags?: Record<string, string>;
  locked: boolean;
  etag: string;
  lastModified: string;
}

const settings = new PersistentMap<string, AppConfigurationSetting>('azure-app-configuration-settings');

function accountName(req: AzureParsedRequest): string {
  const match = req.azureHost.match(/^([^.]+)\.(?:azconfig\.io|appconfig\.azure\.com)$/i);
  return match ? match[1] : APP_CONFIG_ACCOUNT;
}

function settingKey(account: string, key: string, label?: string): string {
  return `${account}\0${key}\0${label ?? ''}`;
}

function appConfigEtag(...parts: string[]): string {
  return `"${createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32)}"`;
}

function decodePathValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function keyFromPath(req: AzureParsedRequest, prefix: string): string {
  return decodePathValue(req.azurePath.slice(prefix.length));
}

function queryLabel(req: AzureParsedRequest): string | undefined {
  const label = req.queryParams.label;
  if (label === undefined || label === '\0') return undefined;
  return label;
}

function appConfigJson(
  data: unknown,
  statusCode = 200,
  contentType = 'application/vnd.microsoft.appconfig.kv+json; charset=utf-8',
  headers: Record<string, string> = {},
): ApiResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': contentType,
      'sync-token': `mockcloud=${randomUUID()};sn=${Date.now()}`,
      ...headers,
    },
    body: JSON.stringify(data),
  };
}

function appConfigHead(headers: Record<string, string> = {}, statusCode = 200): ApiResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/vnd.microsoft.appconfig.kv+json; charset=utf-8',
      'sync-token': `mockcloud=${randomUUID()};sn=${Date.now()}`,
      ...headers,
    },
    body: '',
  };
}

function appConfigError(code: string, detail: string, statusCode: number): ApiResponse {
  return appConfigJson({
    type: code,
    title: code,
    name: code,
    detail,
    status: statusCode,
  }, statusCode, 'application/problem+json; charset=utf-8');
}

function settingBody(setting: AppConfigurationSetting): Record<string, unknown> {
  return {
    key: setting.key,
    label: setting.label,
    value: setting.value,
    content_type: setting.contentType,
    last_modified: setting.lastModified,
    tags: setting.tags ?? {},
    locked: setting.locked,
    etag: setting.etag,
  };
}

function getSetting(account: string, key: string, label?: string): AppConfigurationSetting | undefined {
  return settings.get(settingKey(account, key, label));
}

function listSettings(account: string): AppConfigurationSetting[] {
  return Array.from(settings.values()).filter((setting) => setting.account === account);
}

function quotedHeaderMatches(actual: string, expected: string): boolean {
  return expected === '*' || actual === expected || actual.replace(/^"|"$/g, '') === expected.replace(/^"|"$/g, '');
}

function preconditionFailure(existing: AppConfigurationSetting | undefined, req: AzureParsedRequest): ApiResponse | undefined {
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch === '*' && existing) {
    return appConfigError('PreconditionFailed', 'The configuration setting already exists.', 412);
  }

  const ifMatch = req.headers['if-match'];
  if (ifMatch && (!existing || !quotedHeaderMatches(existing.etag, ifMatch))) {
    return appConfigError('PreconditionFailed', 'The configuration setting has changed.', 412);
  }

  return undefined;
}

function notModified(setting: AppConfigurationSetting | undefined, req: AzureParsedRequest): ApiResponse | undefined {
  const ifNoneMatch = req.headers['if-none-match'];
  if (setting && ifNoneMatch && quotedHeaderMatches(setting.etag, ifNoneMatch)) {
    return appConfigHead({ etag: setting.etag }, 304);
  }
  return undefined;
}

function getBodyString(body: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function getBodyTags(body: Record<string, unknown>): Record<string, string> | undefined {
  const tags = body.tags;
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

export function setAppConfigurationSettingFromArm(
  account: string,
  key: string,
  value: string,
  contentType?: string,
  label?: string,
  tags?: Record<string, string>,
  locked = false,
): void {
  const lastModified = new Date().toISOString();
  settings.set(settingKey(account, key, label), {
    account,
    key,
    label,
    value,
    contentType,
    tags,
    locked,
    lastModified,
    etag: appConfigEtag(account, key, label ?? '', value, contentType ?? '', String(locked), lastModified),
  });
}

export function deleteAppConfigurationSettingFromArm(account: string, key: string, label?: string): void {
  settings.delete(settingKey(account, key, label));
}

function upsertSetting(req: AzureParsedRequest): ApiResponse {
  const account = accountName(req);
  const key = keyFromPath(req, '/kv/');
  const body = req.body as Record<string, unknown>;
  const label = queryLabel(req) ?? getBodyString(body, 'label');
  const existing = getSetting(account, key, label);
  const failure = preconditionFailure(existing, req);
  if (failure) return failure;

  const value = getBodyString(body, 'value');
  const contentType = getBodyString(body, 'content_type', 'contentType');
  setAppConfigurationSettingFromArm(
    account,
    key,
    value ?? '',
    contentType,
    label,
    getBodyTags(body),
    existing?.locked ?? false,
  );
  const setting = getSetting(account, key, label)!;
  return appConfigJson(settingBody(setting), 200, undefined, { etag: setting.etag });
}

function readSetting(req: AzureParsedRequest): ApiResponse {
  const account = accountName(req);
  const key = keyFromPath(req, '/kv/');
  const label = queryLabel(req);
  const setting = getSetting(account, key, label);
  if (!setting) return appConfigError('KeyValueNotFound', `Configuration setting ${key} was not found.`, 404);
  const unchanged = notModified(setting, req);
  if (unchanged) return unchanged;
  if (req.method === 'HEAD') return appConfigHead({ etag: setting.etag });
  return appConfigJson(settingBody(setting), 200, undefined, { etag: setting.etag });
}

function deleteSetting(req: AzureParsedRequest): ApiResponse {
  const account = accountName(req);
  const key = keyFromPath(req, '/kv/');
  const label = queryLabel(req);
  const existing = getSetting(account, key, label);
  if (!existing) return appConfigError('KeyValueNotFound', `Configuration setting ${key} was not found.`, 404);
  const failure = preconditionFailure(existing, req);
  if (failure) return failure;
  settings.delete(settingKey(account, key, label));
  return appConfigJson(settingBody(existing), 200, undefined, { etag: existing.etag });
}

function wildcardMatches(value: string | undefined, pattern: string): boolean {
  if (pattern === '\0') return value === undefined;
  if (pattern === '*') return true;
  if (value === undefined) return false;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

function filterMatches(value: string | undefined, filter: string | undefined): boolean {
  if (filter === undefined) return true;
  return filter.split(',').some((part) => wildcardMatches(value, part));
}

function filteredSettings(req: AzureParsedRequest): AppConfigurationSetting[] {
  const account = accountName(req);
  return listSettings(account).filter((setting) =>
    filterMatches(setting.key, req.queryParams.key) &&
    filterMatches(setting.label, req.queryParams.label));
}

function listEtag(items: AppConfigurationSetting[]): string {
  return appConfigEtag(...items.map((item) => item.etag).sort());
}

function listKeyValues(req: AzureParsedRequest): ApiResponse {
  const items = filteredSettings(req);
  const etag = listEtag(items);
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch && quotedHeaderMatches(etag, ifNoneMatch)) {
    return appConfigHead({ etag }, 304);
  }
  if (req.method === 'HEAD') return appConfigHead({ etag });
  return appConfigJson(
    { items: items.map(settingBody), etag },
    200,
    'application/vnd.microsoft.appconfig.kvset+json; charset=utf-8',
    { etag },
  );
}

function listKeys(req: AzureParsedRequest): ApiResponse {
  const names = Array.from(new Set(listSettings(accountName(req)).map((setting) => setting.key)))
    .filter((name) => filterMatches(name, req.queryParams.name))
    .sort();
  if (req.method === 'HEAD') return appConfigHead();
  return appConfigJson(
    { items: names.map((name) => ({ name })) },
    200,
    'application/vnd.microsoft.appconfig.keyset+json; charset=utf-8',
  );
}

function listLabels(req: AzureParsedRequest): ApiResponse {
  const names = Array.from(new Set(listSettings(accountName(req))
    .map((setting) => setting.label)
    .filter((label): label is string => !!label)))
    .filter((name) => filterMatches(name, req.queryParams.name))
    .sort();
  if (req.method === 'HEAD') return appConfigHead();
  return appConfigJson(
    { items: names.map((name) => ({ name })) },
    200,
    'application/vnd.microsoft.appconfig.labelset+json; charset=utf-8',
  );
}

function setLock(req: AzureParsedRequest, locked: boolean): ApiResponse {
  const account = accountName(req);
  const key = keyFromPath(req, '/locks/');
  const label = queryLabel(req);
  const existing = getSetting(account, key, label);
  if (!existing) return appConfigError('KeyValueNotFound', `Configuration setting ${key} was not found.`, 404);
  const failure = preconditionFailure(existing, req);
  if (failure) return failure;
  const lastModified = new Date().toISOString();
  const next = {
    ...existing,
    locked,
    lastModified,
    etag: appConfigEtag(account, key, label ?? '', existing.value ?? '', existing.contentType ?? '', String(locked), lastModified),
  };
  settings.set(settingKey(account, key, label), next);
  return appConfigJson(settingBody(next), 200, undefined, { etag: next.etag });
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  if ((req.azurePath === '/kv' || req.azurePath === '/kv/') && (req.method === 'GET' || req.method === 'HEAD')) {
    return listKeyValues(req);
  }
  if (req.azurePath.startsWith('/kv/')) {
    if (req.method === 'GET' || req.method === 'HEAD') return readSetting(req);
    if (req.method === 'PUT') return upsertSetting(req);
    if (req.method === 'DELETE') return deleteSetting(req);
  }
  if ((req.azurePath === '/keys' || req.azurePath === '/keys/') && (req.method === 'GET' || req.method === 'HEAD')) {
    return listKeys(req);
  }
  if ((req.azurePath === '/labels' || req.azurePath === '/labels/') && (req.method === 'GET' || req.method === 'HEAD')) {
    return listLabels(req);
  }
  if (req.azurePath.startsWith('/locks/')) {
    if (req.method === 'PUT') return setLock(req, true);
    if (req.method === 'DELETE') return setLock(req, false);
  }

  return appConfigError('BadRequest', 'The requested App Configuration operation is not supported by MockCloud.', 400);
}

export const azureAppConfigurationService: AzureServiceDefinition = {
  name: 'azure-app-configuration',
  hostPatterns: ['*.azconfig.io', '*.appconfig.azure.com'],
  handlers: {
    _default: routeRequest,
  },
};
