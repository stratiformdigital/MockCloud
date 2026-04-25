import { describe, expect, test } from 'vitest';
import { getTestEndpoint } from './client-factory.js';

describe('Azure auth endpoint', () => {
  test('returns a bearer token response', async () => {
    const endpoint = getTestEndpoint();
    const response = await fetch(`${endpoint}/azure/login.microsoftonline.com/mocktenant/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&client_id=mockcloud&client_secret=mockcloud',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.token_type).toBe('Bearer');
    expect(body.access_token).toBeTruthy();
  });

  test('returns tenant-scoped OpenID metadata with Azure OAuth paths', async () => {
    const endpoint = getTestEndpoint();
    const response = await fetch(`${endpoint}/azure/login.microsoftonline.com/mocktenant/v2.0/.well-known/openid-configuration`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.authorization_endpoint).toBe(`${endpoint}/azure/login.microsoftonline.com/mocktenant/oauth2/v2.0/authorize`);
    expect(body.token_endpoint).toBe(`${endpoint}/azure/login.microsoftonline.com/mocktenant/oauth2/v2.0/token`);
    expect(body.end_session_endpoint).toBe(`${endpoint}/azure/login.microsoftonline.com/mocktenant/oauth2/v2.0/logout`);
    expect(body.issuer).toBe(`${endpoint}/azure/login.microsoftonline.com/mocktenant/v2.0`);
    expect(body.jwks_uri).toBe(`${endpoint}/azure/login.microsoftonline.com/mocktenant/discovery/v2.0/keys`);
  });

  test('returns instance discovery metadata for the common authority', async () => {
    const endpoint = getTestEndpoint();
    const response = await fetch(`${endpoint}/azure/login.microsoftonline.com/discovery/instance?api-version=1.1`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tenant_discovery_endpoint).toBe(
      `${endpoint}/azure/login.microsoftonline.com/common/v2.0/.well-known/openid-configuration`,
    );
    expect(body.metadata[0].aliases).toContain('login.microsoftonline.com');
  });

  test('returns an Azure error envelope for unsupported auth paths', async () => {
    const endpoint = getTestEndpoint();
    const response = await fetch(`${endpoint}/azure/login.microsoftonline.com/mocktenant/unsupported`);

    expect(response.status).toBe(404);
    expect(response.headers.get('x-ms-request-id')).toBeTruthy();
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'ResourceNotFound',
        message: 'The requested Azure auth resource was not found.',
      },
    });
  });
});
