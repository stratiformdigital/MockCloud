import { describe, expect, test } from 'vitest';
import { AZURE_SUBSCRIPTION_ID, createResourceManagementClient } from './azure-client-factory.js';
import { getTestEndpoint } from './client-factory.js';

function resourceGroupEndpoint(resourceGroupName: string): string {
  return `${getTestEndpoint()}/azure/management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${resourceGroupName}`;
}

describe('Azure Network', () => {
  const arm = createResourceManagementClient();

  test('creates and lists network security groups through ARM resources', async () => {
    const resourceGroupName = `az-network-rg-${Date.now()}`;
    const securityGroupName = `aznsg${Date.now()}`;

    await arm.resourceGroups.createOrUpdate(resourceGroupName, { location: 'eastus' });

    const response = await fetch(
      `${resourceGroupEndpoint(resourceGroupName)}/providers/Microsoft.Network/networkSecurityGroups/${securityGroupName}?api-version=2024-05-01`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer mockcloud-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: 'eastus',
          properties: {
            securityRules: [
              {
                name: 'allowHttp',
                properties: {
                  priority: 100,
                  direction: 'Inbound',
                  access: 'Allow',
                  protocol: 'Tcp',
                  sourcePortRange: '*',
                  destinationPortRange: '80',
                  sourceAddressPrefix: '*',
                  destinationAddressPrefix: '*',
                },
              },
            ],
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.name).toBe(securityGroupName);
    expect(created.type).toBe('Microsoft.Network/networkSecurityGroups');

    const fetched = await arm.resources.getById(created.id, '2024-05-01');
    expect(fetched.name).toBe(securityGroupName);

    const resources = await fetch(`${resourceGroupEndpoint(resourceGroupName)}/resources?api-version=2021-04-01`, {
      headers: { Authorization: 'Bearer mockcloud-token' },
    });
    expect(resources.status).toBe(200);
    const body = await resources.json();
    expect(body.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: created.id,
        type: 'Microsoft.Network/networkSecurityGroups',
        properties: expect.objectContaining({
          securityRules: expect.arrayContaining([
            expect.objectContaining({ name: 'allowHttp' }),
          ]),
        }),
      }),
    ]));
  });

  test('ARM deployment provisions network security groups and rules', async () => {
    const resourceGroupName = `az-network-deploy-rg-${Date.now()}`;
    const deploymentName = `az-network-deployment-${Date.now()}`;
    const securityGroupName = `aznsgdeploy${Date.now()}`;
    const ruleName = 'allowApi';

    await arm.resourceGroups.createOrUpdate(resourceGroupName, { location: 'eastus' });

    const response = await fetch(
      `${resourceGroupEndpoint(resourceGroupName)}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
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
                nsg: {
                  type: 'Microsoft.Network/networkSecurityGroups',
                  apiVersion: '2024-05-01',
                  name: securityGroupName,
                  location: '[resourceGroup().location]',
                  properties: {},
                },
                rule: {
                  type: 'Microsoft.Network/networkSecurityGroups/securityRules',
                  apiVersion: '2024-05-01',
                  name: `[format('{0}/${ruleName}', '${securityGroupName}')]`,
                  dependsOn: ['nsg'],
                  properties: {
                    priority: 110,
                    direction: 'Inbound',
                    access: 'Allow',
                    protocol: 'Tcp',
                    sourcePortRange: '*',
                    destinationPortRange: '443',
                    sourceAddressPrefix: '*',
                    destinationAddressPrefix: '*',
                  },
                },
              },
              outputs: {
                nsgResourceId: {
                  type: 'string',
                  value: `[resourceId('Microsoft.Network/networkSecurityGroups', '${securityGroupName}')]`,
                },
                ruleResourceId: {
                  type: 'string',
                  value: `[resourceId('Microsoft.Network/networkSecurityGroups/securityRules', '${securityGroupName}', '${ruleName}')]`,
                },
              },
            },
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    const deployment = await response.json();

    const securityGroup = await arm.resources.getById(deployment.properties.outputs.nsgResourceId.value, '2024-05-01');
    expect(securityGroup.name).toBe(securityGroupName);

    const rule = await arm.resources.getById(deployment.properties.outputs.ruleResourceId.value, '2024-05-01');
    expect(rule.name).toBe(`${securityGroupName}/${ruleName}`);
  });
});
