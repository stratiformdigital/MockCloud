import { describe, expect, test } from 'vitest';
import { AZURE_SUBSCRIPTION_ID, createResourceManagementClient } from './azure-client-factory.js';
import { getTestEndpoint } from './client-factory.js';

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

function functionsEndpoint(appName: string): string {
  return `${getTestEndpoint()}/azure/${appName}.azurewebsites.net`;
}

describe('Azure Functions', () => {
  const arm = createResourceManagementClient();

  test('admin and HTTP trigger lifecycle', async () => {
    const appName = `azfunc${Date.now()}`;
    const functionName = 'hello';

    const created = await json<Record<string, any>>(await fetch(
      `${functionsEndpoint(appName)}/admin/functions/${functionName}`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer mockcloud-token',
          'Content-Type': 'application/json',
        },
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
            test_data: { message: 'test' },
          },
        }),
      },
    ));
    expect(created.name).toBe(functionName);
    expect(created.properties.config.bindings).toHaveLength(2);

    const listed = await json<Array<{ name: string }>>(await fetch(
      `${functionsEndpoint(appName)}/admin/functions`,
      { headers: { Authorization: 'Bearer mockcloud-token' } },
    ));
    expect(listed.map((item) => item.name)).toContain(functionName);

    const invoked = await json<Record<string, any>>(await fetch(
      `${functionsEndpoint(appName)}/api/${functionName}?name=world`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hello' }),
      },
    ));
    expect(invoked.functionName).toBe(functionName);
    expect(invoked.query.name).toBe('world');
    expect(invoked.input.message).toBe('hello');

    const deleted = await fetch(
      `${functionsEndpoint(appName)}/admin/functions/${functionName}`,
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer mockcloud-token' },
      },
    );
    expect(deleted.status).toBe(204);

    const missing = await fetch(
      `${functionsEndpoint(appName)}/admin/functions/${functionName}`,
      { headers: { Authorization: 'Bearer mockcloud-token' } },
    );
    expect(missing.status).toBe(404);
  });

  test('ARM deployment provisions function apps and functions', async () => {
    const resourceGroupName = `az-func-rg-${Date.now()}`;
    const deploymentName = `az-func-deployment-${Date.now()}`;
    const appName = `azfuncarm${Date.now()}`;
    const functionName = 'httpTrigger';

    await arm.resourceGroups.createOrUpdate(resourceGroupName, { location: 'eastus' });

    const response = await fetch(
      `${getTestEndpoint()}/azure/management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${resourceGroupName}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer mockcloud-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            mode: 'Incremental',
            template: {
              $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
              contentVersion: '1.0.0.0',
              languageVersion: '2.0',
              resources: {
                app: {
                  type: 'Microsoft.Web/sites',
                  apiVersion: '2024-04-01',
                  name: appName,
                  location: '[resourceGroup().location]',
                  kind: 'functionapp',
                  properties: {
                    siteConfig: {
                      appSettings: [
                        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' },
                      ],
                    },
                  },
                },
                fn: {
                  type: 'Microsoft.Web/sites/functions',
                  apiVersion: '2024-04-01',
                  name: `[format('{0}/{1}', '${appName}', '${functionName}')]`,
                  dependsOn: ['app'],
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
                    test_data: {
                      message: 'from-arm',
                    },
                  },
                },
              },
              outputs: {
                functionResourceId: {
                  type: 'string',
                  value: `[resourceId('Microsoft.Web/sites/functions', '${appName}', '${functionName}')]`,
                },
              },
            },
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    const deployment = await response.json();
    const functionResourceId = deployment.properties.outputs.functionResourceId.value;

    const functionResource = await arm.resources.getById(functionResourceId, '2024-04-01');
    expect(functionResource.name).toBe(`${appName}/${functionName}`);

    const metadata = await json<Record<string, any>>(await fetch(
      `${functionsEndpoint(appName)}/admin/functions/${functionName}`,
      { headers: { Authorization: 'Bearer mockcloud-token' } },
    ));
    expect(metadata.properties.test_data.message).toBe('from-arm');

    const invoked = await json<Record<string, any>>(await fetch(
      `${functionsEndpoint(appName)}/api/${functionName}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deployed: true }),
      },
    ));
    expect(invoked.appName).toBe(appName);
    expect(invoked.input.deployed).toBe(true);
  });

  test('Kudu zip deploy accepts zips and records deployments', async () => {
    const appName = `azfunc${Date.now()}`;
    const scmEndpoint = `${getTestEndpoint()}/azure/${appName}.scm.azurewebsites.net`;
    const zip = Buffer.from('PK\u0003\u0004 mockcloud zip payload');

    const deploy = await fetch(`${scmEndpoint}/api/zipdeploy?isAsync=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: zip,
    });
    expect(deploy.status).toBe(202);
    const deployBody = await deploy.json() as Record<string, any>;
    expect(deployBody.complete).toBe(true);
    expect(deployBody.status).toBe(4);
    expect(deployBody.site_bytes).toBe(zip.length);

    const latest = await json<Record<string, any>>(await fetch(`${scmEndpoint}/api/deployments/latest`));
    expect(latest.id).toBe(deployBody.id);
    expect(latest.complete).toBe(true);

    const byId = await json<Record<string, any>>(await fetch(`${scmEndpoint}/api/deployments/${deployBody.id}`));
    expect(byId.site_name).toBe(appName);

    const logEntries = await json<Array<Record<string, any>>>(
      await fetch(`${scmEndpoint}/api/deployments/${deployBody.id}/log`),
    );
    expect(logEntries.length).toBeGreaterThan(0);
    expect(logEntries[0].id).toBe(`${deployBody.id}:received`);
  });
});
