import { describe, expect, test } from 'vitest';
import { CryptographyClient, KnownEncryptionAlgorithms } from '@azure/keyvault-keys';
import { azureCredential, AZURE_VAULT_NAME, createAzureProxyHttpClient, createKeyClient, createSecretClient } from './azure-client-factory.js';
import { getTestEndpoint } from './client-factory.js';

describe('Azure Key Vault', () => {
  const secrets = createSecretClient();
  const keys = createKeyClient();

  test('secret lifecycle', async () => {
    const name = `az-secret-${Date.now()}`;

    const setResponse = await fetch(`${getTestEndpoint()}/azure/${AZURE_VAULT_NAME}.vault.azure.net/secrets/${name}?api-version=2025-07-01`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mockcloud-token' },
      body: JSON.stringify({
        value: 'secret-value',
        contentType: 'text/plain',
        tags: { env: 'test' },
      }),
    });
    expect(setResponse.status).toBe(200);

    const value = await secrets.getSecret(name);
    expect(value.value).toBe('secret-value');
    expect(value.properties.contentType).toBe('text/plain');
    expect(value.properties.tags?.env).toBe('test');

    const names: string[] = [];
    for await (const item of secrets.listPropertiesOfSecrets()) {
      names.push(item.name);
    }
    expect(names).toContain(name);

    await secrets.beginDeleteSecret(name);
    const deleted = await secrets.getDeletedSecret(name);
    expect(deleted.name).toBe(name);
    await secrets.purgeDeletedSecret(name);
  });

  test('key lifecycle with encrypt and decrypt', async () => {
    const name = `az-key-${Date.now()}`;
    const created = await keys.createKey(name, 'RSA', {
      keyOps: ['encrypt', 'decrypt'],
    });

    expect(created.name).toBe(name);

    const fetched = await keys.getKey(name);
    expect(fetched.name).toBe(name);

    const names: string[] = [];
    for await (const item of keys.listPropertiesOfKeys()) {
      names.push(item.name);
    }
    expect(names).toContain(name);

    const crypto = new CryptographyClient(created.id!, azureCredential, {
      httpClient: createAzureProxyHttpClient(),
      retryOptions: { maxRetries: 0 },
    });
    const plaintext = Buffer.from('hello key vault');
    const encrypted = await crypto.encrypt(KnownEncryptionAlgorithms.RSAOaep, plaintext);
    const decrypted = await crypto.decrypt(KnownEncryptionAlgorithms.RSAOaep, encrypted.result);
    expect(Buffer.from(decrypted.result)).toEqual(plaintext);
  });
});
