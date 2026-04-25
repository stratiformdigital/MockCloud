import { describe, expect, test } from 'vitest';
import {
  AZURE_STORAGE_ACCOUNT,
  AZURE_SUBSCRIPTION_ID,
  AZURE_VAULT_NAME,
  createAppConfigurationClient,
  createBlobServiceClient,
  createResourceManagementClient,
  createSecretClient,
} from './azure-client-factory.js';
import { getTestEndpoint } from './client-factory.js';

async function deployTemplate(rgName: string, body: Record<string, unknown>): Promise<void> {
  const deploymentName = `deploy-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const response = await fetch(
    `${getTestEndpoint()}/azure/management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${rgName}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
    {
      method: 'PUT',
      headers: { Authorization: 'Bearer mockcloud', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    throw new Error(`deployment failed: ${response.status} ${await response.text()}`);
  }
}

describe('Azure Resource Manager', () => {
  const client = createResourceManagementClient();

  test('lists tenants from the ARM tenant collection', async () => {
    const response = await fetch(
      `${getTestEndpoint()}/azure/management.azure.com/tenants?api-version=2022-12-01`,
      { headers: { Authorization: 'Bearer mockcloud-token' } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-ms-request-id')).toBeTruthy();
    const body = await response.json();
    expect(body.value).toEqual([
      {
        id: '/tenants/00000000-0000-0000-0000-000000000000',
        tenantId: '00000000-0000-0000-0000-000000000000',
      },
    ]);
  });

  test('returns an Azure error envelope for missing resource groups', async () => {
    const name = `az-missing-rg-${Date.now()}`;
    const response = await fetch(
      `${getTestEndpoint()}/azure/management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${name}?api-version=2022-09-01`,
      { headers: { Authorization: 'Bearer mockcloud-token' } },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('x-ms-request-id')).toBeTruthy();
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'ResourceGroupNotFound',
        message: `Resource group '${name}' could not be found.`,
      },
    });
  });

  test('resource group lifecycle', async () => {
    const name = `az-rg-${Date.now()}`;

    const created = await client.resourceGroups.createOrUpdate(name, {
      location: 'eastus',
      tags: { env: 'test' },
    });
    expect(created.name).toBe(name);
    expect(created.location).toBe('eastus');
    expect(created.tags?.env).toBe('test');

    const fetched = await client.resourceGroups.get(name);
    expect(fetched.name).toBe(name);

    const names: string[] = [];
    for await (const group of client.resourceGroups.list()) {
      names.push(group.name!);
    }
    expect(names).toContain(name);

    expect((await client.resourceGroups.checkExistence(name)).body).toBe(true);
    await client.resourceGroups.beginDeleteAndWait(name);
    expect((await client.resourceGroups.checkExistence(name)).body).toBe(false);
  });

  test('resource group deployment provisions mocked Azure resources', async () => {
    const resourceGroupName = `az-deploy-rg-${Date.now()}`;
    const deploymentName = `az-deployment-${Date.now()}`;
    const containerName = `azdeploy${Date.now()}`;
    const secretName = `az-deploy-secret-${Date.now()}`;

    await client.resourceGroups.createOrUpdate(resourceGroupName, { location: 'eastus' });

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
            parameters: {
              containerName: { value: containerName },
              secretName: { value: secretName },
              secretValue: { value: 'deployed-secret-value' },
            },
            template: {
              $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
              contentVersion: '1.0.0.0',
              languageVersion: '2.0',
              parameters: {
                containerName: { type: 'string' },
                secretName: { type: 'string' },
                secretValue: { type: 'secureString' },
              },
              variables: {
                vaultName: AZURE_VAULT_NAME,
              },
              resources: {
                storageAccount: {
                  type: 'Microsoft.Storage/storageAccounts',
                  apiVersion: '2023-05-01',
                  name: AZURE_STORAGE_ACCOUNT,
                  location: '[resourceGroup().location]',
                  sku: { name: 'Standard_LRS' },
                  kind: 'StorageV2',
                },
                container: {
                  type: 'Microsoft.Storage/storageAccounts/blobServices/containers',
                  apiVersion: '2023-05-01',
                  name: `[format('{0}/default/{1}', '${AZURE_STORAGE_ACCOUNT}', parameters('containerName'))]`,
                  dependsOn: ['storageAccount'],
                  properties: {
                    publicAccess: 'None',
                  },
                },
                vault: {
                  type: 'Microsoft.KeyVault/vaults',
                  apiVersion: '2023-07-01',
                  name: '[variables(\'vaultName\')]',
                  location: '[resourceGroup().location]',
                  properties: {
                    tenantId: '00000000-0000-0000-0000-000000000000',
                    sku: { family: 'A', name: 'standard' },
                    accessPolicies: [],
                  },
                },
                secret: {
                  type: 'Microsoft.KeyVault/vaults/secrets',
                  apiVersion: '2023-07-01',
                  name: '[format(\'{0}/{1}\', variables(\'vaultName\'), parameters(\'secretName\'))]',
                  dependsOn: ['vault'],
                  tags: { source: 'deployment' },
                  properties: {
                    value: '[parameters(\'secretValue\')]',
                    contentType: 'text/plain',
                  },
                },
              },
              outputs: {
                containerResourceId: {
                  type: 'string',
                  value: `[resourceId('Microsoft.Storage/storageAccounts/blobServices/containers', '${AZURE_STORAGE_ACCOUNT}', 'default', parameters('containerName'))]`,
                },
                secretResourceId: {
                  type: 'string',
                  value: '[resourceId(\'Microsoft.KeyVault/vaults/secrets\', variables(\'vaultName\'), parameters(\'secretName\'))]',
                },
                storageKey: {
                  type: 'string',
                  value: `[listKeys(resourceId('Microsoft.Storage/storageAccounts', '${AZURE_STORAGE_ACCOUNT}'), '2023-05-01').keys[0].value]`,
                },
              },
            },
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    const deployment = await response.json();
    expect(deployment.properties.provisioningState).toBe('Succeeded');
    expect(deployment.properties.outputs.storageKey.value).toBe(Buffer.from('mockcloud').toString('base64'));

    const containerResourceId = deployment.properties.outputs.containerResourceId.value;
    const secretResourceId = deployment.properties.outputs.secretResourceId.value;

    const containerResource = await client.resources.getById(containerResourceId, '2023-05-01');
    expect(containerResource.name).toBe(`${AZURE_STORAGE_ACCOUNT}/default/${containerName}`);

    const resources: string[] = [];
    for await (const resource of client.resources.listByResourceGroup(resourceGroupName)) {
      resources.push(resource.id!);
    }
    expect(resources).toContain(containerResourceId);
    expect(resources).toContain(secretResourceId);

    const container = createBlobServiceClient().getContainerClient(containerName);
    await expect(container.getProperties()).resolves.toMatchObject({});

    const secret = await createSecretClient().getSecret(secretName);
    expect(secret.value).toBe('deployed-secret-value');
    expect(secret.properties.contentType).toBe('text/plain');
    expect(secret.properties.tags?.source).toBe('deployment');
  });

  test('resource group deployment provisions App Configuration key-values', async () => {
    const resourceGroupName = `az-appconfig-rg-${Date.now()}`;
    const deploymentName = `az-appconfig-deployment-${Date.now()}`;
    const key = `appconfig-key-${Date.now()}`;

    await client.resourceGroups.createOrUpdate(resourceGroupName, { location: 'eastus' });

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
                appConfig: {
                  type: 'Microsoft.AppConfiguration/configurationStores',
                  apiVersion: '2024-06-01',
                  name: 'mockconfig',
                  location: '[resourceGroup().location]',
                  sku: { name: 'free' },
                },
                setting: {
                  type: 'Microsoft.AppConfiguration/configurationStores/keyValues',
                  apiVersion: '2024-06-01',
                  name: `[format('{0}/{1}', 'mockconfig', '${key}')]`,
                  dependsOn: ['appConfig'],
                  properties: {
                    value: 'deployed-app-config-value',
                    contentType: 'text/plain',
                    label: 'dev',
                    tags: {
                      source: 'deployment',
                    },
                  },
                },
              },
              outputs: {
                settingResourceId: {
                  type: 'string',
                  value: `[resourceId('Microsoft.AppConfiguration/configurationStores/keyValues', 'mockconfig', '${key}')]`,
                },
              },
            },
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    const deployment = await response.json();
    const settingResourceId = deployment.properties.outputs.settingResourceId.value;

    const settingResource = await client.resources.getById(settingResourceId, '2024-06-01');
    expect(settingResource.name).toBe(`mockconfig/${key}`);

    const setting = await createAppConfigurationClient().getConfigurationSetting({ key, label: 'dev' });
    expect(setting.value).toBe('deployed-app-config-value');
    expect(setting.contentType).toBe('text/plain');
    expect(setting.tags?.source).toBe('deployment');
  });

  test('Microsoft.Web/sites responses include site properties az CLI expects', async () => {
    const rgName = `arm-site-shape-${Date.now()}`;
    const siteName = `site${Date.now()}`;
    await client.resourceGroups.createOrUpdate(rgName, { location: 'eastus' });
    await deployTemplate(rgName, {
      properties: {
        mode: 'Incremental',
        parameters: {},
        template: {
          $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
          contentVersion: '1.0.0.0',
          resources: [
            {
              type: 'Microsoft.Web/sites',
              apiVersion: '2023-12-01',
              name: siteName,
              location: 'eastus',
              kind: 'functionapp,linux',
              properties: { httpsOnly: true, siteConfig: { appSettings: [{ name: 'FOO', value: 'bar' }] } },
            },
          ],
        },
      },
    });

    const siteId = `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${rgName}/providers/Microsoft.Web/sites/${siteName}`;
    const site = await client.resources.getById(siteId, '2024-11-01');
    expect(site.properties?.sku).toBeDefined();
    expect(site.properties?.state).toBe('Running');
    expect(site.properties?.defaultHostName).toBe(`${siteName}.azurewebsites.net`);
    const enabledHostNames: string[] = site.properties?.enabledHostNames as string[];
    expect(enabledHostNames).toContain(`${siteName}.azurewebsites.net`);
    expect(enabledHostNames).toContain(`${siteName}.scm.azurewebsites.net`);
    const sslStates = site.properties?.hostNameSslStates as Array<Record<string, string>>;
    expect(sslStates.some((s) => s.hostType === 'Repository')).toBe(true);
  });

  test('sites/config/web and basicPublishingCredentialsPolicies/scm are synthesized', async () => {
    const rgName = `arm-site-synth-${Date.now()}`;
    const siteName = `site${Date.now()}`;
    await client.resourceGroups.createOrUpdate(rgName, { location: 'eastus' });
    await deployTemplate(rgName, {
      properties: {
        mode: 'Incremental',
        parameters: {},
        template: {
          $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
          contentVersion: '1.0.0.0',
          resources: [
            {
              type: 'Microsoft.Web/sites',
              apiVersion: '2023-12-01',
              name: siteName,
              location: 'eastus',
              properties: {},
            },
          ],
        },
      },
    });

    const webConfig = await client.resources.getById(
      `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${rgName}/providers/Microsoft.Web/sites/${siteName}/config/web`,
      '2024-11-01',
    );
    expect(webConfig.type).toBe('Microsoft.Web/sites/config');
    expect(webConfig.properties).toBeDefined();

    const scmPolicy = await client.resources.getById(
      `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${rgName}/providers/Microsoft.Web/sites/${siteName}/basicPublishingCredentialsPolicies/scm`,
      '2024-11-01',
    );
    expect((scmPolicy.properties as Record<string, unknown>)?.allow).toBe(true);
  });

  test('sites/config/appsettings/list returns app settings as key-value object', async () => {
    const rgName = `arm-appsettings-${Date.now()}`;
    const siteName = `site${Date.now()}`;
    await client.resourceGroups.createOrUpdate(rgName, { location: 'eastus' });
    await deployTemplate(rgName, {
      properties: {
        mode: 'Incremental',
        parameters: {},
        template: {
          $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
          contentVersion: '1.0.0.0',
          resources: [
            {
              type: 'Microsoft.Web/sites',
              apiVersion: '2023-12-01',
              name: siteName,
              location: 'eastus',
              properties: {
                siteConfig: {
                  appSettings: [
                    { name: 'FOO', value: 'bar' },
                    { name: 'BAZ', value: 'qux' },
                  ],
                },
              },
            },
          ],
        },
      },
    });

    const listResponse = await fetch(
      `${getTestEndpoint()}/azure/management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${rgName}/providers/Microsoft.Web/sites/${siteName}/config/appsettings/list?api-version=2024-11-01`,
      { method: 'POST', headers: { Authorization: 'Bearer mockcloud' } },
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json() as Record<string, any>;
    expect(listBody.properties.FOO).toBe('bar');
    expect(listBody.properties.BAZ).toBe('qux');
  });

  test('functionAppStacks global GET returns a Node.js stack', async () => {
    const response = await fetch(
      `${getTestEndpoint()}/azure/management.azure.com/providers/Microsoft.Web/functionAppStacks?api-version=2024-11-01`,
      { headers: { Authorization: 'Bearer mockcloud' } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, any>;
    expect(Array.isArray(body.value)).toBe(true);
    expect(body.value.some((stack: Record<string, any>) => stack.name === 'node')).toBe(true);
  });

  test('afdEndpoints purge action returns 202', async () => {
    const response = await fetch(
      `${getTestEndpoint()}/azure/management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/any-rg/providers/Microsoft.Cdn/profiles/any-profile/afdEndpoints/any-endpoint/purge?api-version=2024-05-01`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer mockcloud', 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentPaths: ['/*'] }),
      },
    );
    expect(response.status).toBe(202);
  });
});
