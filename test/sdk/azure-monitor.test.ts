import { describe, expect, test } from 'vitest';
import { AZURE_SUBSCRIPTION_ID, createResourceManagementClient } from './azure-client-factory.js';
import { getTestEndpoint } from './client-factory.js';

function ingestionEndpoint(workspaceName: string): string {
  return `${getTestEndpoint()}/azure/${workspaceName}.ods.opinsights.azure.com`;
}

function queryEndpoint(workspaceName: string): string {
  return `${getTestEndpoint()}/azure/api.loganalytics.io/v1/workspaces/${workspaceName}/query`;
}

describe('Azure Monitor Logs', () => {
  const arm = createResourceManagementClient();

  test('ingests records and returns Log Analytics query results', async () => {
    const workspaceName = `azmon${Date.now()}`;
    const tableName = 'AppEvents';

    const ingest = await fetch(`${ingestionEndpoint(workspaceName)}/api/logs?api-version=2016-04-01`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Log-Type': tableName,
      },
      body: JSON.stringify([
        {
          message: 'hello-monitor',
          level: 'info',
        },
      ]),
    });
    expect(ingest.status).toBe(200);

    const tables = await fetch(`${ingestionEndpoint(workspaceName)}/api/tables`);
    expect(tables.status).toBe(200);
    const tablesBody = await tables.json();
    expect(tablesBody.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: tableName,
        properties: expect.objectContaining({
          recordCount: 1,
        }),
      }),
    ]));

    const query = await fetch(queryEndpoint(workspaceName), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mockcloud-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: `${tableName} | take 10` }),
    });
    expect(query.status).toBe(200);
    const queryBody = await query.json();
    expect(queryBody.tables[0].columns.map((column: { name: string }) => column.name)).toContain('message');
    expect(queryBody.tables[0].rows).toEqual(expect.arrayContaining([
      expect.arrayContaining(['hello-monitor']),
    ]));
  });

  test('ARM deployment provisions Log Analytics workspaces and tables', async () => {
    const resourceGroupName = `az-monitor-rg-${Date.now()}`;
    const deploymentName = `az-monitor-deployment-${Date.now()}`;
    const workspaceName = `azmonarm${Date.now()}`;
    const tableName = 'AppTraces_CL';

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
                workspace: {
                  type: 'Microsoft.OperationalInsights/workspaces',
                  apiVersion: '2023-09-01',
                  name: workspaceName,
                  location: '[resourceGroup().location]',
                  properties: {
                    sku: {
                      name: 'PerGB2018',
                    },
                    retentionInDays: 30,
                  },
                },
                table: {
                  type: 'Microsoft.OperationalInsights/workspaces/tables',
                  apiVersion: '2023-09-01',
                  name: `[format('{0}/${tableName}', '${workspaceName}')]`,
                  dependsOn: ['workspace'],
                  properties: {
                    retentionInDays: 30,
                    totalRetentionInDays: 30,
                  },
                },
              },
              outputs: {
                workspaceResourceId: {
                  type: 'string',
                  value: `[resourceId('Microsoft.OperationalInsights/workspaces', '${workspaceName}')]`,
                },
                tableResourceId: {
                  type: 'string',
                  value: `[resourceId('Microsoft.OperationalInsights/workspaces/tables', '${workspaceName}', '${tableName}')]`,
                },
              },
            },
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    const deployment = await response.json();

    const workspace = await arm.resources.getById(deployment.properties.outputs.workspaceResourceId.value, '2023-09-01');
    expect(workspace.name).toBe(workspaceName);

    const table = await arm.resources.getById(deployment.properties.outputs.tableResourceId.value, '2023-09-01');
    expect(table.name).toBe(`${workspaceName}/${tableName}`);

    const tables = await fetch(`${ingestionEndpoint(workspaceName)}/api/tables`);
    const tablesBody = await tables.json();
    expect(tablesBody.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: tableName,
      }),
    ]));
  });
});
