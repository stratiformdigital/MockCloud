import { randomUUID } from 'node:crypto';
import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';
import { PersistentMap } from '../../../state/store.js';
import { azureError, jsonOk } from '../../response.js';

interface VaultSecret {
  vault: string;
  name: string;
  version: string;
  value: string;
  contentType?: string;
  tags?: Record<string, string>;
  created: number;
  updated: number;
  deletedDate?: number;
  scheduledPurgeDate?: number;
}

interface VaultKey {
  vault: string;
  name: string;
  version: string;
  keyType: string;
  keyOps: string[];
  tags?: Record<string, string>;
  created: number;
  updated: number;
  deletedDate?: number;
  scheduledPurgeDate?: number;
}

const secrets = new PersistentMap<string, VaultSecret>('azure-keyvault-secrets');
const deletedSecrets = new PersistentMap<string, VaultSecret>('azure-keyvault-deleted-secrets');
const keys = new PersistentMap<string, VaultKey>('azure-keyvault-keys');

function vaultName(req: AzureParsedRequest): string {
  const match = req.azureHost.match(/^([^.]+)\.vault\.azure\.net$/i);
  return match ? match[1] : 'mockvault';
}

function pathParts(req: AzureParsedRequest): string[] {
  return req.azurePath.split('/').filter(Boolean).map(decodeURIComponent);
}

function secretKey(vault: string, name: string): string {
  return `${vault}\0${name}`;
}

function keyKey(vault: string, name: string): string {
  return `${vault}\0${name}`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function baseUrl(req: AzureParsedRequest): string {
  return `https://${req.azureHost}`;
}

function secretId(req: AzureParsedRequest, secret: VaultSecret): string {
  return `${baseUrl(req)}/secrets/${encodeURIComponent(secret.name)}/${secret.version}`;
}

function deletedSecretRecoveryId(req: AzureParsedRequest, secret: VaultSecret): string {
  return `${baseUrl(req)}/deletedsecrets/${encodeURIComponent(secret.name)}`;
}

function keyId(req: AzureParsedRequest, key: VaultKey): string {
  return `${baseUrl(req)}/keys/${encodeURIComponent(key.name)}/${key.version}`;
}

function upsertSecret(
  vault: string,
  name: string,
  value: string,
  contentType?: string,
  tags?: Record<string, string>,
): VaultSecret {
  const existing = secrets.get(secretKey(vault, name));
  const now = nowSeconds();
  const secret: VaultSecret = {
    vault,
    name,
    version: randomUUID().replace(/-/g, ''),
    value,
    contentType,
    tags,
    created: existing?.created ?? now,
    updated: now,
  };
  secrets.set(secretKey(vault, name), secret);
  deletedSecrets.delete(secretKey(vault, name));
  return secret;
}

function upsertKey(
  vault: string,
  name: string,
  keyType: string,
  keyOps: string[],
  tags?: Record<string, string>,
): VaultKey {
  const now = nowSeconds();
  const existing = keys.get(keyKey(vault, name));
  const key: VaultKey = {
    vault,
    name,
    version: randomUUID().replace(/-/g, ''),
    keyType,
    keyOps,
    tags,
    created: existing?.created ?? now,
    updated: now,
  };
  keys.set(keyKey(vault, name), key);
  return key;
}

function secretBundle(req: AzureParsedRequest, secret: VaultSecret): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    enabled: true,
    created: secret.created,
    updated: secret.updated,
    recoveryLevel: 'Recoverable+Purgeable',
  };
  if (secret.deletedDate) {
    attributes.deletedDate = secret.deletedDate;
  }
  if (secret.scheduledPurgeDate) {
    attributes.scheduledPurgeDate = secret.scheduledPurgeDate;
  }

  return {
    value: secret.value,
    id: secretId(req, secret),
    contentType: secret.contentType,
    attributes,
    tags: secret.tags,
    recoveryId: secret.deletedDate ? deletedSecretRecoveryId(req, secret) : undefined,
  };
}

function secretProperties(req: AzureParsedRequest, secret: VaultSecret): Record<string, unknown> {
  const bundle = secretBundle(req, secret);
  delete bundle.value;
  return bundle;
}

function keyBundle(req: AzureParsedRequest, key: VaultKey): Record<string, unknown> {
  const kid = keyId(req, key);
  return {
    key: {
      kid,
      kty: key.keyType,
      key_ops: key.keyOps,
      n: key.keyType.startsWith('RSA') ? 'AQAB' : undefined,
      e: key.keyType.startsWith('RSA') ? 'AQAB' : undefined,
    },
    attributes: {
      enabled: true,
      created: key.created,
      updated: key.updated,
      recoveryLevel: 'Recoverable+Purgeable',
    },
    tags: key.tags,
  };
}

function keyProperties(req: AzureParsedRequest, key: VaultKey): Record<string, unknown> {
  return {
    kid: keyId(req, key),
    attributes: {
      enabled: true,
      created: key.created,
      updated: key.updated,
      recoveryLevel: 'Recoverable+Purgeable',
    },
    tags: key.tags,
  };
}

function setSecret(req: AzureParsedRequest, name: string): ApiResponse {
  const vault = vaultName(req);
  const body = req.body as { value?: string; contentType?: string; tags?: Record<string, string> };
  const secret = upsertSecret(
    vault,
    name,
    typeof body.value === 'string' ? body.value : '',
    body.contentType,
    body.tags,
  );
  return jsonOk(secretBundle(req, secret));
}

function getSecret(req: AzureParsedRequest, name: string): ApiResponse {
  const vault = vaultName(req);
  const secret = secrets.get(secretKey(vault, name));
  if (!secret) return azureError('SecretNotFound', `A secret with name ${name} was not found.`, 404);
  return jsonOk(secretBundle(req, secret));
}

function listSecrets(req: AzureParsedRequest): ApiResponse {
  const vault = vaultName(req);
  const value = Array.from(secrets.values())
    .filter((secret) => secret.vault === vault)
    .map((secret) => secretProperties(req, secret));
  return jsonOk({ value, nextLink: null });
}

function deleteSecret(req: AzureParsedRequest, name: string): ApiResponse {
  const vault = vaultName(req);
  const existing = secrets.get(secretKey(vault, name));
  if (!existing) return azureError('SecretNotFound', `A secret with name ${name} was not found.`, 404);
  const now = nowSeconds();
  existing.deletedDate = now;
  existing.scheduledPurgeDate = now + 30 * 24 * 60 * 60;
  secrets.delete(secretKey(vault, name));
  deletedSecrets.set(secretKey(vault, name), existing);
  return jsonOk(secretBundle(req, existing));
}

function getDeletedSecret(req: AzureParsedRequest, name: string): ApiResponse {
  const vault = vaultName(req);
  const secret = deletedSecrets.get(secretKey(vault, name));
  if (!secret) return azureError('SecretNotFound', `A deleted secret with name ${name} was not found.`, 404);
  return jsonOk(secretBundle(req, secret));
}

function purgeDeletedSecret(req: AzureParsedRequest, name: string): ApiResponse {
  const vault = vaultName(req);
  deletedSecrets.delete(secretKey(vault, name));
  return { statusCode: 204, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '' };
}

function createKey(req: AzureParsedRequest, name: string): ApiResponse {
  const vault = vaultName(req);
  const body = req.body as { kty?: string; key_ops?: string[]; keyOps?: string[]; tags?: Record<string, string> };
  const key = upsertKey(
    vault,
    name,
    body.kty ?? 'RSA',
    body.key_ops ?? body.keyOps ?? ['encrypt', 'decrypt'],
    body.tags,
  );
  return jsonOk(keyBundle(req, key));
}

function getKey(req: AzureParsedRequest, name: string): ApiResponse {
  const vault = vaultName(req);
  const key = keys.get(keyKey(vault, name));
  if (!key) return azureError('KeyNotFound', `A key with name ${name} was not found.`, 404);
  return jsonOk(keyBundle(req, key));
}

function listKeys(req: AzureParsedRequest): ApiResponse {
  const vault = vaultName(req);
  const value = Array.from(keys.values())
    .filter((key) => key.vault === vault)
    .map((key) => keyProperties(req, key));
  return jsonOk({ value, nextLink: null });
}

function base64UrlToBuffer(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function bufferToBase64Url(value: Buffer): string {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encrypt(req: AzureParsedRequest, name: string): ApiResponse {
  const vault = vaultName(req);
  const key = keys.get(keyKey(vault, name));
  if (!key) return azureError('KeyNotFound', `A key with name ${name} was not found.`, 404);
  const body = req.body as { alg?: string; value?: string };
  if (!body.value) return azureError('BadParameter', 'value is required.', 400);
  const plaintext = base64UrlToBuffer(body.value);
  const ciphertext = Buffer.concat([Buffer.from(`encrypted:${key.version}:`), plaintext]);
  return jsonOk({ kid: keyId(req, key), alg: body.alg ?? 'RSA-OAEP', value: bufferToBase64Url(ciphertext) });
}

function decrypt(req: AzureParsedRequest, name: string): ApiResponse {
  const vault = vaultName(req);
  const key = keys.get(keyKey(vault, name));
  if (!key) return azureError('KeyNotFound', `A key with name ${name} was not found.`, 404);
  const body = req.body as { alg?: string; value?: string };
  if (!body.value) return azureError('BadParameter', 'value is required.', 400);
  const decoded = base64UrlToBuffer(body.value);
  const prefix = Buffer.from(`encrypted:${key.version}:`);
  if (decoded.subarray(0, prefix.length).compare(prefix) !== 0) {
    return azureError('BadParameter', 'The ciphertext is invalid.', 400);
  }
  const plaintext = decoded.subarray(prefix.length);
  return jsonOk({ kid: keyId(req, key), alg: body.alg ?? 'RSA-OAEP', value: bufferToBase64Url(plaintext) });
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  const parts = pathParts(req);
  const [collection, name, third, operation] = parts;
  const normalizedCollection = collection?.toLowerCase();

  if (normalizedCollection === 'secrets') {
    if (!name && req.method === 'GET') return listSecrets(req);
    if (name && req.method === 'PUT') return setSecret(req, name);
    if (name && req.method === 'GET') return getSecret(req, name);
    if (name && req.method === 'DELETE') return deleteSecret(req, name);
  }

  if (normalizedCollection === 'deletedsecrets') {
    if (name && req.method === 'GET') return getDeletedSecret(req, name);
    if (name && req.method === 'DELETE') return purgeDeletedSecret(req, name);
  }

  if (normalizedCollection === 'keys') {
    if (!name && req.method === 'GET') return listKeys(req);
    if (name && third?.toLowerCase() === 'create' && req.method === 'POST') return createKey(req, name);
    if (name && !third && req.method === 'GET') return getKey(req, name);
    if (name && third && !operation && req.method === 'GET') return getKey(req, name);
    if (name && third && operation?.toLowerCase() === 'encrypt' && req.method === 'POST') return encrypt(req, name);
    if (name && third && operation?.toLowerCase() === 'decrypt' && req.method === 'POST') return decrypt(req, name);
  }

  return azureError('NotImplemented', 'The requested Key Vault operation is not implemented.', 400);
}

export const azureKeyVaultService: AzureServiceDefinition = {
  name: 'azure-keyvault',
  hostPatterns: ['*.vault.azure.net'],
  handlers: {
    _default: routeRequest,
  },
};

export function setVaultSecretFromArm(
  vault: string,
  name: string,
  value: string,
  contentType?: string,
  tags?: Record<string, string>,
): void {
  upsertSecret(vault, name, value, contentType, tags);
}

export function createVaultKeyFromArm(
  vault: string,
  name: string,
  keyType: string,
  keyOps: string[],
  tags?: Record<string, string>,
): void {
  upsertKey(vault, name, keyType, keyOps, tags);
}
