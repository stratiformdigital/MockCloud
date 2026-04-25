import { describe, expect, test } from 'vitest';
import { AZURE_SUBSCRIPTION_ID, createResourceManagementClient } from './azure-client-factory.js';
import { getTestEndpoint } from './client-factory.js';

function apiManagementEndpoint(serviceName: string): string {
  return `${getTestEndpoint()}/azure/${serviceName}.azure-api.net`;
}

describe('Azure API Management', () => {
  const arm = createResourceManagementClient();

  test('creates APIs and invokes matching gateway operations', async () => {
    const serviceName = `azapim${Date.now()}`;
    const apiName = 'orders';
    const operationName = 'getOrder';

    const api = await fetch(`${apiManagementEndpoint(serviceName)}/apis/${apiName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          displayName: 'Orders',
          path: 'orders',
          protocols: ['https'],
        },
      }),
    });
    expect(api.status).toBe(201);

    const operation = await fetch(`${apiManagementEndpoint(serviceName)}/apis/${apiName}/operations/${operationName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          displayName: 'Get order',
          method: 'GET',
          urlTemplate: '/{orderId}',
        },
      }),
    });
    expect(operation.status).toBe(201);

    const response = await fetch(`${apiManagementEndpoint(serviceName)}/orders/123?version=local`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      serviceName,
      apiName,
      operationName,
      method: 'GET',
      path: '/orders/123',
      query: { version: 'local' },
    });
  });

  test('ARM deployment provisions services, APIs, and operations', async () => {
    const resourceGroupName = `az-apim-rg-${Date.now()}`;
    const deploymentName = `az-apim-deployment-${Date.now()}`;
    const serviceName = `azapimarm${Date.now()}`;
    const apiName = 'inventory';
    const operationName = 'createItem';

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
                service: {
                  type: 'Microsoft.ApiManagement/service',
                  apiVersion: '2024-05-01',
                  name: serviceName,
                  location: '[resourceGroup().location]',
                  sku: {
                    name: 'Developer',
                    capacity: 1,
                  },
                  properties: {
                    publisherEmail: 'mockcloud@example.invalid',
                    publisherName: 'MockCloud',
                  },
                },
                api: {
                  type: 'Microsoft.ApiManagement/service/apis',
                  apiVersion: '2024-05-01',
                  name: `[format('{0}/{1}', '${serviceName}', '${apiName}')]`,
                  dependsOn: ['service'],
                  properties: {
                    displayName: 'Inventory',
                    path: 'inventory',
                    protocols: ['https'],
                  },
                },
                operation: {
                  type: 'Microsoft.ApiManagement/service/apis/operations',
                  apiVersion: '2024-05-01',
                  name: `[format('{0}/{1}/{2}', '${serviceName}', '${apiName}', '${operationName}')]`,
                  dependsOn: ['api'],
                  properties: {
                    displayName: 'Create item',
                    method: 'POST',
                    urlTemplate: '/',
                  },
                },
              },
              outputs: {
                apiResourceId: {
                  type: 'string',
                  value: `[resourceId('Microsoft.ApiManagement/service/apis', '${serviceName}', '${apiName}')]`,
                },
                operationResourceId: {
                  type: 'string',
                  value: `[resourceId('Microsoft.ApiManagement/service/apis/operations', '${serviceName}', '${apiName}', '${operationName}')]`,
                },
              },
            },
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    const deployment = await response.json();

    const apiResource = await arm.resources.getById(deployment.properties.outputs.apiResourceId.value, '2024-05-01');
    expect(apiResource.name).toBe(`${serviceName}/${apiName}`);

    const operationResource = await arm.resources.getById(deployment.properties.outputs.operationResourceId.value, '2024-05-01');
    expect(operationResource.name).toBe(`${serviceName}/${apiName}/${operationName}`);

    const apis = await fetch(`${apiManagementEndpoint(serviceName)}/apis`);
    expect(apis.status).toBe(200);
    const apisBody = await apis.json();
    expect(apisBody.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: apiName,
        properties: expect.objectContaining({
          path: 'inventory',
        }),
      }),
    ]));

    const invocation = await fetch(`${apiManagementEndpoint(serviceName)}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: 'local' }),
    });
    expect(invocation.status).toBe(200);
    const invocationBody = await invocation.json();
    expect(invocationBody).toMatchObject({
      serviceName,
      apiName,
      operationName,
      method: 'POST',
      input: { item: 'local' },
    });
  });
});
