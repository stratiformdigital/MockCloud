import { describe, expect, test } from 'vitest';
import { AZURE_SUBSCRIPTION_ID, createResourceManagementClient } from './azure-client-factory.js';
import { getTestEndpoint } from './client-factory.js';

function subscriptionEndpoint(): string {
  return `${getTestEndpoint()}/azure/management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}`;
}

describe('Azure Defender for Cloud', () => {
  const arm = createResourceManagementClient();

  test('creates and lists Defender plans through ARM resources', async () => {
    const planName = `StorageAccounts${Date.now()}`;

    const response = await fetch(
      `${subscriptionEndpoint()}/providers/Microsoft.Security/pricings/${planName}?api-version=2024-01-01`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer mockcloud-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            pricingTier: 'Standard',
            subPlan: 'DefenderForStorageV2',
            extensions: [
              {
                name: 'OnUploadMalwareScanning',
                isEnabled: 'True',
                additionalExtensionProperties: {
                  capGBPerMonthPerStorageAccount: '5000',
                },
              },
            ],
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.name).toBe(planName);
    expect(created.type).toBe('Microsoft.Security/pricings');

    const fetched = await arm.resources.getById(created.id, '2024-01-01');
    expect(fetched.name).toBe(planName);

    const resources = await fetch(`${subscriptionEndpoint()}/resources?api-version=2021-04-01`, {
      headers: { Authorization: 'Bearer mockcloud-token' },
    });
    expect(resources.status).toBe(200);
    const body = await resources.json();
    expect(body.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: created.id,
        type: 'Microsoft.Security/pricings',
        properties: expect.objectContaining({
          pricingTier: 'Standard',
          subPlan: 'DefenderForStorageV2',
          extensions: expect.arrayContaining([
            expect.objectContaining({
              name: 'OnUploadMalwareScanning',
              isEnabled: 'True',
            }),
          ]),
        }),
      }),
    ]));
  });

  test('ARM deployment provisions Defender plans', async () => {
    const deploymentName = `az-defender-deployment-${Date.now()}`;
    const planName = `StorageAccountsDeploy${Date.now()}`;

    const response = await fetch(
      `${subscriptionEndpoint()}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
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
                defenderPlan: {
                  type: 'Microsoft.Security/pricings',
                  apiVersion: '2024-01-01',
                  name: planName,
                  properties: {
                    pricingTier: 'Standard',
                    subPlan: 'DefenderForStorageV2',
                    extensions: [
                      {
                        name: 'OnUploadMalwareScanning',
                        isEnabled: 'True',
                        additionalExtensionProperties: {
                          capGBPerMonthPerStorageAccount: '1000',
                        },
                      },
                    ],
                  },
                },
              },
              outputs: {
                planResourceId: {
                  type: 'string',
                  value: `[subscriptionResourceId('Microsoft.Security/pricings', '${planName}')]`,
                },
              },
            },
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    const deployment = await response.json();

    const plan = await arm.resources.getById(deployment.properties.outputs.planResourceId.value, '2024-01-01');
    expect(plan.name).toBe(planName);
    expect(plan.properties).toMatchObject({
      pricingTier: 'Standard',
      subPlan: 'DefenderForStorageV2',
      extensions: [
        expect.objectContaining({
          name: 'OnUploadMalwareScanning',
        }),
      ],
    });
  });
});
