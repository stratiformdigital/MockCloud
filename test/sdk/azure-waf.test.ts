import { describe, expect, test } from 'vitest';
import { AZURE_SUBSCRIPTION_ID, createResourceManagementClient } from './azure-client-factory.js';
import { getTestEndpoint } from './client-factory.js';

function resourceGroupEndpoint(resourceGroupName: string): string {
  return `${getTestEndpoint()}/azure/management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${resourceGroupName}`;
}

describe('Azure Web Application Firewall', () => {
  const arm = createResourceManagementClient();

  test('creates and lists WAF policies through ARM resources', async () => {
    const resourceGroupName = `az-waf-rg-${Date.now()}`;
    const policyName = `azwaf${Date.now()}`;

    await arm.resourceGroups.createOrUpdate(resourceGroupName, { location: 'eastus' });

    const response = await fetch(
      `${resourceGroupEndpoint(resourceGroupName)}/providers/Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/${policyName}?api-version=2024-05-01`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer mockcloud-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: 'eastus',
          properties: {
            policySettings: {
              enabledState: 'Enabled',
              mode: 'Prevention',
              requestBodyCheck: true,
            },
            managedRules: {
              managedRuleSets: [
                {
                  ruleSetType: 'OWASP',
                  ruleSetVersion: '3.2',
                },
              ],
            },
            customRules: [],
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.name).toBe(policyName);
    expect(created.type).toBe('Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies');

    const fetched = await arm.resources.getById(created.id, '2024-05-01');
    expect(fetched.name).toBe(policyName);

    const resources = await fetch(`${resourceGroupEndpoint(resourceGroupName)}/resources?api-version=2021-04-01`, {
      headers: { Authorization: 'Bearer mockcloud-token' },
    });
    expect(resources.status).toBe(200);
    const body = await resources.json();
    expect(body.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: created.id,
        type: 'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies',
        properties: expect.objectContaining({
          policySettings: expect.objectContaining({
            mode: 'Prevention',
          }),
        }),
      }),
    ]));
  });

  test('ARM deployment provisions WAF policies', async () => {
    const resourceGroupName = `az-waf-deploy-rg-${Date.now()}`;
    const deploymentName = `az-waf-deployment-${Date.now()}`;
    const policyName = `azwafdeploy${Date.now()}`;

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
                wafPolicy: {
                  type: 'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies',
                  apiVersion: '2024-05-01',
                  name: policyName,
                  location: '[resourceGroup().location]',
                  properties: {
                    policySettings: {
                      enabledState: 'Enabled',
                      mode: 'Detection',
                      requestBodyCheck: true,
                    },
                    managedRules: {
                      managedRuleSets: [
                        {
                          ruleSetType: 'OWASP',
                          ruleSetVersion: '3.2',
                        },
                      ],
                    },
                    customRules: [
                      {
                        name: 'BlockBadBot',
                        priority: 100,
                        ruleType: 'MatchRule',
                        action: 'Block',
                        matchConditions: [],
                      },
                    ],
                  },
                },
              },
              outputs: {
                policyResourceId: {
                  type: 'string',
                  value: `[resourceId('Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies', '${policyName}')]`,
                },
              },
            },
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    const deployment = await response.json();

    const policy = await arm.resources.getById(deployment.properties.outputs.policyResourceId.value, '2024-05-01');
    expect(policy.name).toBe(policyName);
    expect(policy.properties).toMatchObject({
      policySettings: {
        mode: 'Detection',
      },
      customRules: [
        expect.objectContaining({
          name: 'BlockBadBot',
        }),
      ],
    });
  });
});
