import { describe, expect, test } from 'vitest';
import { getTestEndpoint } from './client-factory.js';

function graphEndpoint(path: string): string {
  return `${getTestEndpoint()}/azure/graph.microsoft.com/v1.0${path}`;
}

async function graphJson(path: string, init?: RequestInit): Promise<Response> {
  return fetch(graphEndpoint(path), {
    ...init,
    headers: {
      Authorization: 'Bearer mockcloud-token',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
}

describe('Azure Entra Microsoft Graph', () => {
  test('returns the current directory identity', async () => {
    const response = await graphJson('/me');

    expect(response.status).toBe(200);
    const me = await response.json();
    expect(me).toMatchObject({
      id: '00000000-0000-0000-0000-000000000000',
      userPrincipalName: 'mockcloud@example.com',
    });
  });

  test('creates, lists, reads, and deletes directory users', async () => {
    const suffix = Date.now();
    const displayName = `Graph User ${suffix}`;
    const userPrincipalName = `graph.user.${suffix}@example.com`;

    const createResponse = await graphJson('/users', {
      method: 'POST',
      body: JSON.stringify({
        displayName,
        userPrincipalName,
        mailNickname: `graphuser${suffix}`,
        accountEnabled: true,
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.displayName).toBe(displayName);
    expect(created.userPrincipalName).toBe(userPrincipalName);

    const getResponse = await graphJson(`/users/${created.id}`);
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toMatchObject({ id: created.id, displayName });

    const listResponse = await graphJson('/users');
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json();
    expect(list.value).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.id, userPrincipalName }),
    ]));

    const deleteResponse = await graphJson(`/users/${created.id}`, { method: 'DELETE' });
    expect(deleteResponse.status).toBe(204);

    const missingResponse = await graphJson(`/users/${created.id}`);
    expect(missingResponse.status).toBe(404);
  });

  test('creates groups, app registrations, and service principals', async () => {
    const suffix = Date.now();

    const groupResponse = await graphJson('/groups', {
      method: 'POST',
      body: JSON.stringify({
        displayName: `Developers ${suffix}`,
        mailNickname: `developers${suffix}`,
        mailEnabled: false,
        securityEnabled: true,
      }),
    });
    expect(groupResponse.status).toBe(201);
    const group = await groupResponse.json();
    expect(group.securityEnabled).toBe(true);

    const appResponse = await graphJson('/applications', {
      method: 'POST',
      body: JSON.stringify({
        displayName: `web-app-${suffix}`,
        signInAudience: 'AzureADMyOrg',
        identifierUris: [`api://web-app-${suffix}`],
      }),
    });
    expect(appResponse.status).toBe(201);
    const app = await appResponse.json();
    expect(app.appId).toBeTruthy();

    const principalResponse = await graphJson('/servicePrincipals', {
      method: 'POST',
      body: JSON.stringify({
        appId: app.appId,
      }),
    });
    expect(principalResponse.status).toBe(201);
    const principal = await principalResponse.json();
    expect(principal).toMatchObject({
      appId: app.appId,
      displayName: app.displayName,
      servicePrincipalType: 'Application',
    });

    const applications = await graphJson('/applications');
    expect(applications.status).toBe(200);
    expect((await applications.json()).value).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: app.id, appId: app.appId }),
    ]));

    const servicePrincipals = await graphJson('/servicePrincipals');
    expect(servicePrincipals.status).toBe(200);
    expect((await servicePrincipals.json()).value).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: principal.id, appId: app.appId }),
    ]));
  });
});
