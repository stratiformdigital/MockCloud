import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { AZURE_SUBSCRIPTION_ID, createResourceManagementClient } from './azure-client-factory.js';
import { getTestEndpoint } from './client-factory.js';

const contributorRoleDefinitionId = `/subscriptions/${AZURE_SUBSCRIPTION_ID}/providers/Microsoft.Authorization/roleDefinitions/b24988ac-6180-42a0-ab88-20f7382dd24c`;

function subscriptionEndpoint(): string {
  return `${getTestEndpoint()}/azure/management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}`;
}

function resourceGroupEndpoint(resourceGroupName: string): string {
  return `${subscriptionEndpoint()}/resourceGroups/${resourceGroupName}`;
}

describe('Azure Identity', () => {
  const arm = createResourceManagementClient();

  test('creates managed identities and role assignments through ARM resources', async () => {
    const resourceGroupName = `az-identity-rg-${Date.now()}`;
    const identityName = `azidentity${Date.now()}`;
    const assignmentName = randomUUID();
    const principalId = randomUUID();

    await arm.resourceGroups.createOrUpdate(resourceGroupName, { location: 'eastus' });

    const identityResponse = await fetch(
      `${resourceGroupEndpoint(resourceGroupName)}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${identityName}?api-version=2023-01-31`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer mockcloud-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: 'eastus',
          properties: {
            clientId: randomUUID(),
            principalId,
            tenantId: '00000000-0000-0000-0000-000000000000',
            provisioningState: 'Succeeded',
          },
        }),
      },
    );

    expect(identityResponse.status).toBe(201);
    const identity = await identityResponse.json();
    expect(identity.name).toBe(identityName);
    expect(identity.type).toBe('Microsoft.ManagedIdentity/userAssignedIdentities');

    const assignmentResponse = await fetch(
      `${subscriptionEndpoint()}/providers/Microsoft.Authorization/roleAssignments/${assignmentName}?api-version=2022-04-01`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer mockcloud-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            principalId,
            principalType: 'ServicePrincipal',
            roleDefinitionId: contributorRoleDefinitionId,
            scope: `/subscriptions/${AZURE_SUBSCRIPTION_ID}`,
          },
        }),
      },
    );

    expect(assignmentResponse.status).toBe(201);
    const assignment = await assignmentResponse.json();
    expect(assignment.name).toBe(assignmentName);
    expect(assignment.type).toBe('Microsoft.Authorization/roleAssignments');

    const fetchedIdentity = await arm.resources.getById(identity.id, '2023-01-31');
    expect(fetchedIdentity.properties).toMatchObject({ principalId });

    const fetchedAssignment = await arm.resources.getById(assignment.id, '2022-04-01');
    expect(fetchedAssignment.properties).toMatchObject({
      principalId,
      roleDefinitionId: contributorRoleDefinitionId,
    });

    const resources = await fetch(`${subscriptionEndpoint()}/resources?api-version=2021-04-01`, {
      headers: { Authorization: 'Bearer mockcloud-token' },
    });
    expect(resources.status).toBe(200);
    const body = await resources.json();
    expect(body.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: identity.id,
        type: 'Microsoft.ManagedIdentity/userAssignedIdentities',
      }),
      expect.objectContaining({
        id: assignment.id,
        type: 'Microsoft.Authorization/roleAssignments',
      }),
    ]));
  });

  test('ARM deployment provisions managed identities and role assignments', async () => {
    const resourceGroupName = `az-identity-deploy-rg-${Date.now()}`;
    const deploymentName = `az-identity-deployment-${Date.now()}`;
    const identityName = `azidentitydeploy${Date.now()}`;
    const assignmentName = randomUUID();
    const principalId = randomUUID();

    await arm.resourceGroups.createOrUpdate(resourceGroupName, { location: 'eastus' });

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
                identity: {
                  type: 'Microsoft.ManagedIdentity/userAssignedIdentities',
                  apiVersion: '2023-01-31',
                  name: identityName,
                  scope: `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${resourceGroupName}`,
                  location: 'eastus',
                  properties: {
                    clientId: randomUUID(),
                    principalId,
                    tenantId: '00000000-0000-0000-0000-000000000000',
                    provisioningState: 'Succeeded',
                  },
                },
                assignment: {
                  type: 'Microsoft.Authorization/roleAssignments',
                  apiVersion: '2022-04-01',
                  name: assignmentName,
                  properties: {
                    principalId,
                    principalType: 'ServicePrincipal',
                    roleDefinitionId: `[subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')]`,
                    scope: `[subscription().id]`,
                  },
                },
              },
              outputs: {
                identityResourceId: {
                  type: 'string',
                  value: `[resourceId('${AZURE_SUBSCRIPTION_ID}', '${resourceGroupName}', 'Microsoft.ManagedIdentity/userAssignedIdentities', '${identityName}')]`,
                },
                assignmentResourceId: {
                  type: 'string',
                  value: `[subscriptionResourceId('Microsoft.Authorization/roleAssignments', '${assignmentName}')]`,
                },
              },
            },
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    const deployment = await response.json();

    const identity = await arm.resources.getById(deployment.properties.outputs.identityResourceId.value, '2023-01-31');
    expect(identity.name).toBe(identityName);
    expect(identity.properties).toMatchObject({ principalId });

    const assignment = await arm.resources.getById(deployment.properties.outputs.assignmentResourceId.value, '2022-04-01');
    expect(assignment.name).toBe(assignmentName);
    expect(assignment.properties).toMatchObject({
      principalId,
      roleDefinitionId: contributorRoleDefinitionId,
    });
  });
});
