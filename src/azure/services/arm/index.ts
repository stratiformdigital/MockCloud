import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';
import { PersistentMap } from '../../../state/store.js';
import { LOCATION, SUBSCRIPTION_ID, TENANT_ID } from '../../config.js';
import { azureError, jsonOk, noContent } from '../../response.js';
import { createContainer, deleteContainer, getContainer } from '../blob-storage/storage.js';
import { createVaultKeyFromArm, setVaultSecretFromArm } from '../keyvault/index.js';
import { deleteAppConfigurationSettingFromArm, setAppConfigurationSettingFromArm } from '../app-configuration/index.js';
import { createFunctionAppFromArm, createFunctionFromArm, deleteFunctionAppFromArm, deleteFunctionFromArm } from '../functions/index.js';
import { createEventGridSubscriptionFromArm, createEventGridTopicFromArm, deleteEventGridSubscriptionFromArm, deleteEventGridTopicFromArm } from '../eventgrid/index.js';
import {
  createCosmosContainerFromArm,
  createCosmosDatabaseFromArm,
  deleteCosmosContainerFromArm,
  deleteCosmosDatabaseFromArm,
} from '../cosmos/index.js';
import {
  createApiManagementApiFromArm,
  createApiManagementOperationFromArm,
  createApiManagementServiceFromArm,
  deleteApiManagementApiFromArm,
  deleteApiManagementOperationFromArm,
  deleteApiManagementServiceFromArm,
} from '../api-management/index.js';
import {
  createLogAnalyticsTableFromArm,
  createLogAnalyticsWorkspaceFromArm,
  deleteLogAnalyticsTableFromArm,
  deleteLogAnalyticsWorkspaceFromArm,
} from '../monitor/index.js';
import { buildArmResourceId, provisionArmTemplate, type ArmTemplateResource } from './template.js';

interface ResourceGroup {
  id: string;
  name: string;
  type: 'Microsoft.Resources/resourceGroups';
  location: string;
  tags?: Record<string, string>;
  properties: {
    provisioningState: 'Succeeded';
  };
}

interface ArmGenericResource {
  id: string;
  name: string;
  type: string;
  location?: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
  sku?: unknown;
  kind?: string;
  identity?: unknown;
  apiVersion?: string;
}

interface ArmDeployment {
  id: string;
  name: string;
  type: 'Microsoft.Resources/deployments';
  properties: {
    provisioningState: 'Succeeded';
    mode: string;
    timestamp: string;
    duration: string;
    templateHash: string;
    parameters: Record<string, { value: unknown }>;
    outputs: Record<string, { type: string; value: unknown }>;
    outputResources: Array<{ id: string }>;
  };
}

const resourceGroups = new PersistentMap<string, ResourceGroup>('azure-arm-resource-groups');
const armResources = new PersistentMap<string, ArmGenericResource>('azure-arm-resources');
const deployments = new PersistentMap<string, ArmDeployment>('azure-arm-deployments');

function resourceGroupKey(subscriptionId: string, name: string): string {
  return `${subscriptionId}\0${name.toLowerCase()}`;
}

function resourceGroupId(subscriptionId: string, name: string): string {
  return `/subscriptions/${subscriptionId}/resourceGroups/${name}`;
}

function armResourceKey(id: string): string {
  return id.toLowerCase();
}

function groupFromBody(req: AzureParsedRequest, name: string): ResourceGroup {
  const subscriptionId = req.subscriptionId ?? SUBSCRIPTION_ID;
  const body = req.body as { location?: string; tags?: Record<string, string> };
  return {
    id: resourceGroupId(subscriptionId, name),
    name,
    type: 'Microsoft.Resources/resourceGroups',
    location: body.location ?? LOCATION,
    tags: body.tags,
    properties: {
      provisioningState: 'Succeeded',
    },
  };
}

function parseResourceGroupName(req: AzureParsedRequest): string | null {
  const parts = req.azurePath.split('/').filter(Boolean).map(decodeURIComponent);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].toLowerCase() === 'resourcegroups') {
      return parts[i + 1] ?? null;
    }
  }
  return null;
}

function pathParts(req: AzureParsedRequest): string[] {
  return req.azurePath.split('/').filter(Boolean).map(decodeURIComponent);
}

function isResourceGroupsCollection(req: AzureParsedRequest): boolean {
  const parts = req.azurePath.split('/').filter(Boolean);
  return parts.length === 3 &&
    parts[0].toLowerCase() === 'subscriptions' &&
    parts[2].toLowerCase() === 'resourcegroups';
}

function isSubscriptionsCollection(req: AzureParsedRequest): boolean {
  const parts = pathParts(req);
  return parts.length === 1 && parts[0].toLowerCase() === 'subscriptions';
}

function isTenantsCollection(req: AzureParsedRequest): boolean {
  const parts = pathParts(req);
  return parts.length === 1 && parts[0].toLowerCase() === 'tenants';
}

function isSubscriptionItem(req: AzureParsedRequest): boolean {
  const parts = pathParts(req);
  return parts.length === 2 && parts[0].toLowerCase() === 'subscriptions';
}

function isResourcesCollection(req: AzureParsedRequest): boolean {
  const parts = pathParts(req);
  if (parts.length === 3) {
    return parts[0].toLowerCase() === 'subscriptions' && parts[2].toLowerCase() === 'resources';
  }
  return parts.length === 5 &&
    parts[0].toLowerCase() === 'subscriptions' &&
    parts[2].toLowerCase() === 'resourcegroups' &&
    parts[4].toLowerCase() === 'resources';
}

function parseDeploymentTarget(req: AzureParsedRequest): { id: string; name: string; resourceGroupName?: string } | null {
  const parts = pathParts(req);
  if (parts.length === 6 &&
    parts[0].toLowerCase() === 'subscriptions' &&
    parts[2].toLowerCase() === 'providers' &&
    parts[3].toLowerCase() === 'microsoft.resources' &&
    parts[4].toLowerCase() === 'deployments') {
    const id = `/subscriptions/${parts[1]}/providers/Microsoft.Resources/deployments/${parts[5]}`;
    return { id, name: parts[5] };
  }

  if (parts.length === 8 &&
    parts[0].toLowerCase() === 'subscriptions' &&
    parts[2].toLowerCase() === 'resourcegroups' &&
    parts[4].toLowerCase() === 'providers' &&
    parts[5].toLowerCase() === 'microsoft.resources' &&
    parts[6].toLowerCase() === 'deployments') {
    const id = `/subscriptions/${parts[1]}/resourceGroups/${parts[3]}/providers/Microsoft.Resources/deployments/${parts[7]}`;
    return { id, name: parts[7], resourceGroupName: parts[3] };
  }

  return null;
}

function parseProviderResourcePath(req: AzureParsedRequest): { id: string; name: string; type: string } | null {
  const parts = pathParts(req);
  const providerIndex = parts.findIndex((part) => part.toLowerCase() === 'providers');
  if (providerIndex === -1 || providerIndex + 3 >= parts.length) return null;
  if (parts[providerIndex + 1].toLowerCase() === 'microsoft.resources' &&
    parts[providerIndex + 2].toLowerCase() === 'deployments') {
    return null;
  }

  const namespace = parts[providerIndex + 1];
  const tail = parts.slice(providerIndex + 2);
  if (tail.length % 2 !== 0) return null;

  const typeParts: string[] = [];
  const nameParts: string[] = [];
  for (let i = 0; i < tail.length; i += 2) {
    typeParts.push(tail[i]);
    nameParts.push(tail[i + 1]);
  }

  const type = [namespace, ...typeParts].join('/');
  const name = nameParts.join('/');
  return {
    id: buildArmResourceId(req.subscriptionId ?? SUBSCRIPTION_ID, req.resourceGroup, type, name),
    name,
    type,
  };
}

function createOrUpdateResourceGroup(req: AzureParsedRequest, name: string): ApiResponse {
  const subscriptionId = req.subscriptionId ?? SUBSCRIPTION_ID;
  const group = groupFromBody(req, name);
  const existed = resourceGroups.has(resourceGroupKey(subscriptionId, name));
  resourceGroups.set(resourceGroupKey(subscriptionId, name), group);
  return jsonOk(group, existed ? 200 : 201);
}

function getResourceGroup(req: AzureParsedRequest, name: string): ApiResponse {
  const subscriptionId = req.subscriptionId ?? SUBSCRIPTION_ID;
  const group = resourceGroups.get(resourceGroupKey(subscriptionId, name));
  if (!group) return azureError('ResourceGroupNotFound', `Resource group '${name}' could not be found.`, 404);
  return jsonOk(group);
}

function checkResourceGroup(req: AzureParsedRequest, name: string): ApiResponse {
  const subscriptionId = req.subscriptionId ?? SUBSCRIPTION_ID;
  if (!resourceGroups.has(resourceGroupKey(subscriptionId, name))) {
    return { statusCode: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '' };
  }
  return { statusCode: 204, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '' };
}

function deleteResourceGroup(req: AzureParsedRequest, name: string): ApiResponse {
  const subscriptionId = req.subscriptionId ?? SUBSCRIPTION_ID;
  resourceGroups.delete(resourceGroupKey(subscriptionId, name));
  const prefix = `${resourceGroupId(subscriptionId, name).toLowerCase()}/`;
  for (const resource of Array.from(armResources.values())) {
    if (resource.id.toLowerCase().startsWith(prefix)) {
      deleteArmResource(resource);
    }
  }
  for (const deployment of Array.from(deployments.values())) {
    if (deployment.id.toLowerCase().startsWith(prefix)) {
      deployments.delete(armResourceKey(deployment.id));
    }
  }
  return noContent(200);
}

function listResourceGroups(req: AzureParsedRequest): ApiResponse {
  const subscriptionId = req.subscriptionId ?? SUBSCRIPTION_ID;
  const value = Array.from(resourceGroups.values())
    .filter((group) => group.id.startsWith(`/subscriptions/${subscriptionId}/`));
  return jsonOk({ value, nextLink: null });
}

function subscriptionBody(subscriptionId: string): Record<string, unknown> {
  return {
    id: `/subscriptions/${subscriptionId}`,
    subscriptionId,
    tenantId: TENANT_ID,
    displayName: 'MockCloud',
    state: 'Enabled',
    subscriptionPolicies: {
      locationPlacementId: 'Public_2014-09-01',
      quotaId: 'PayAsYouGo_2014-09-01',
      spendingLimit: 'Off',
    },
    authorizationSource: 'RoleBased',
  };
}

function listSubscriptions(): ApiResponse {
  return jsonOk({ value: [subscriptionBody(SUBSCRIPTION_ID)], nextLink: null });
}

function getSubscription(req: AzureParsedRequest): ApiResponse {
  return jsonOk(subscriptionBody(req.subscriptionId ?? SUBSCRIPTION_ID));
}

function listTenants(): ApiResponse {
  return jsonOk({
    value: [
      {
        id: `/tenants/${TENANT_ID}`,
        tenantId: TENANT_ID,
      },
    ],
    nextLink: null,
  });
}

function genericFromTemplateResource(resource: ArmTemplateResource): ArmGenericResource {
  const generic: ArmGenericResource = {
    id: resource.id,
    name: resource.name,
    type: resource.type,
    apiVersion: resource.apiVersion,
  };
  if (resource.location) generic.location = resource.location;
  if (resource.tags) generic.tags = resource.tags;
  if (resource.properties) generic.properties = resource.properties;
  if (resource.sku !== undefined) generic.sku = resource.sku;
  if (resource.kind) generic.kind = resource.kind;
  if (resource.identity !== undefined) generic.identity = resource.identity;
  return generic;
}

function persistResource(resource: ArmTemplateResource): void {
  if (resource.type.toLowerCase() === 'microsoft.resources/resourcegroups') {
    const subscriptionId = resource.id.split('/')[2] || SUBSCRIPTION_ID;
    const group: ResourceGroup = {
      id: resource.id,
      name: resource.name,
      type: 'Microsoft.Resources/resourceGroups',
      location: resource.location ?? LOCATION,
      tags: resource.tags,
      properties: { provisioningState: 'Succeeded' },
    };
    resourceGroups.set(resourceGroupKey(subscriptionId, resource.name), group);
    return;
  }

  const generic = genericFromTemplateResource(resource);
  armResources.set(armResourceKey(generic.id), generic);
  applyResourceSideEffects(generic);
}

function applyResourceSideEffects(resource: ArmGenericResource): void {
  const resourceType = resource.type.toLowerCase();
  if (resourceType === 'microsoft.storage/storageaccounts/blobservices/containers') {
    const [account, _blobService, container] = resource.name.split('/');
    if (account && container && !getContainer(account, container)) {
      createContainer(account, container, {});
    }
  }

  if (resourceType === 'microsoft.keyvault/vaults/secrets') {
    const [vault, secret] = resource.name.split('/');
    if (vault && secret) {
      setVaultSecretFromArm(
        vault,
        secret,
        String(resource.properties?.value ?? ''),
        typeof resource.properties?.contentType === 'string' ? resource.properties.contentType : undefined,
        resource.tags,
      );
    }
  }

  if (resourceType === 'microsoft.keyvault/vaults/keys') {
    const [vault, key] = resource.name.split('/');
    if (vault && key) {
      const keyOps = Array.isArray(resource.properties?.keyOps)
        ? resource.properties.keyOps.map(String)
        : ['encrypt', 'decrypt'];
      createVaultKeyFromArm(
        vault,
        key,
        typeof resource.properties?.kty === 'string' ? resource.properties.kty : 'RSA',
        keyOps,
        resource.tags,
      );
    }
  }

  if (resourceType === 'microsoft.appconfiguration/configurationstores/keyvalues') {
    const [store, key] = resource.name.split('/');
    if (store && key) {
      const label = typeof resource.properties?.label === 'string' ? resource.properties.label : undefined;
      const tags = resource.properties?.tags && typeof resource.properties.tags === 'object' && !Array.isArray(resource.properties.tags)
        ? Object.fromEntries(Object.entries(resource.properties.tags as Record<string, unknown>).map(([tagKey, tagValue]) => [tagKey, String(tagValue)]))
        : resource.tags;
      setAppConfigurationSettingFromArm(
        store,
        key,
        String(resource.properties?.value ?? ''),
        typeof resource.properties?.contentType === 'string' ? resource.properties.contentType : undefined,
        label,
        tags,
        resource.properties?.locked === true,
      );
    }
  }

  if (resourceType === 'microsoft.documentdb/databaseaccounts/sqldatabases') {
    const [account, database] = resource.name.split('/');
    if (account && database) {
      createCosmosDatabaseFromArm({
        account,
        name: database,
        properties: resource.properties,
      });
    }
  }

  if (resourceType === 'microsoft.documentdb/databaseaccounts/sqldatabases/containers') {
    const [account, database, container] = resource.name.split('/');
    if (account && database && container) {
      createCosmosContainerFromArm({
        account,
        databaseId: database,
        name: container,
        properties: resource.properties,
      });
    }
  }

  if (resourceType === 'microsoft.web/sites') {
    createFunctionAppFromArm({
      id: resource.id,
      name: resource.name,
      location: resource.location,
      kind: resource.kind,
      tags: resource.tags,
      properties: resource.properties,
    });
  }

  if (resourceType === 'microsoft.web/sites/functions') {
    const [appName, functionName] = resource.name.split('/');
    if (appName && functionName) {
      const files = resource.properties?.files && typeof resource.properties.files === 'object' && !Array.isArray(resource.properties.files)
        ? Object.fromEntries(Object.entries(resource.properties.files as Record<string, unknown>).map(([fileName, contents]) => [fileName, String(contents)]))
        : undefined;
      const config = resource.properties?.config && typeof resource.properties.config === 'object' && !Array.isArray(resource.properties.config)
        ? resource.properties.config as Record<string, unknown>
        : undefined;
      createFunctionFromArm({
        appName,
        name: functionName,
        id: resource.id,
        config,
        files,
        testData: resource.properties?.test_data ?? resource.properties?.testData,
        properties: resource.properties,
      });
    }
  }

  if (resourceType === 'microsoft.eventgrid/topics') {
    createEventGridTopicFromArm({
      id: resource.id,
      name: resource.name,
      location: resource.location,
      tags: resource.tags,
      properties: resource.properties,
    });
  }

  if (resourceType === 'microsoft.eventgrid/topics/eventsubscriptions') {
    const [topicName, subscriptionName] = resource.name.split('/');
    if (topicName && subscriptionName) {
      createEventGridSubscriptionFromArm({
        id: resource.id,
        topicName,
        name: subscriptionName,
        destination: resource.properties?.destination && typeof resource.properties.destination === 'object' && !Array.isArray(resource.properties.destination)
          ? resource.properties.destination as Record<string, unknown>
          : undefined,
        filter: resource.properties?.filter && typeof resource.properties.filter === 'object' && !Array.isArray(resource.properties.filter)
          ? resource.properties.filter as Record<string, unknown>
          : undefined,
        labels: Array.isArray(resource.properties?.labels)
          ? resource.properties.labels.map(String)
          : undefined,
        properties: resource.properties,
      });
    }
  }

  if (resourceType === 'microsoft.apimanagement/service') {
    createApiManagementServiceFromArm({
      id: resource.id,
      name: resource.name,
      location: resource.location,
      tags: resource.tags,
      properties: resource.properties,
      sku: resource.sku,
    });
  }

  if (resourceType === 'microsoft.apimanagement/service/apis') {
    const [serviceName, apiName] = resource.name.split('/');
    if (serviceName && apiName) {
      createApiManagementApiFromArm({
        id: resource.id,
        serviceName,
        name: apiName,
        properties: resource.properties,
      });
    }
  }

  if (resourceType === 'microsoft.apimanagement/service/apis/operations') {
    const [serviceName, apiName, operationName] = resource.name.split('/');
    if (serviceName && apiName && operationName) {
      createApiManagementOperationFromArm({
        id: resource.id,
        serviceName,
        apiName,
        name: operationName,
        properties: resource.properties,
      });
    }
  }

  if (resourceType === 'microsoft.operationalinsights/workspaces') {
    createLogAnalyticsWorkspaceFromArm({
      id: resource.id,
      name: resource.name,
      location: resource.location,
      tags: resource.tags,
      properties: resource.properties,
    });
  }

  if (resourceType === 'microsoft.operationalinsights/workspaces/tables') {
    const [workspaceName, tableName] = resource.name.split('/');
    if (workspaceName && tableName) {
      createLogAnalyticsTableFromArm({
        id: resource.id,
        workspaceName,
        name: tableName,
        properties: resource.properties,
      });
    }
  }
}

function deleteArmResource(resource: ArmGenericResource): void {
  if (resource.type.toLowerCase() === 'microsoft.storage/storageaccounts/blobservices/containers') {
    const [account, _blobService, container] = resource.name.split('/');
    if (account && container) {
      deleteContainer(account, container);
    }
  }
  if (resource.type.toLowerCase() === 'microsoft.appconfiguration/configurationstores/keyvalues') {
    const [store, key] = resource.name.split('/');
    const label = typeof resource.properties?.label === 'string' ? resource.properties.label : undefined;
    if (store && key) {
      deleteAppConfigurationSettingFromArm(store, key, label);
    }
  }
  if (resource.type.toLowerCase() === 'microsoft.documentdb/databaseaccounts/sqldatabases/containers') {
    const [account, database, container] = resource.name.split('/');
    if (account && database && container) {
      deleteCosmosContainerFromArm(account, database, container);
    }
  }
  if (resource.type.toLowerCase() === 'microsoft.documentdb/databaseaccounts/sqldatabases') {
    const [account, database] = resource.name.split('/');
    if (account && database) {
      deleteCosmosDatabaseFromArm(account, database);
    }
  }
  if (resource.type.toLowerCase() === 'microsoft.web/sites/functions') {
    const [appName, functionName] = resource.name.split('/');
    if (appName && functionName) {
      deleteFunctionFromArm(appName, functionName);
    }
  }
  if (resource.type.toLowerCase() === 'microsoft.web/sites') {
    deleteFunctionAppFromArm(resource.name);
  }
  if (resource.type.toLowerCase() === 'microsoft.eventgrid/topics/eventsubscriptions') {
    const [topicName, subscriptionName] = resource.name.split('/');
    if (topicName && subscriptionName) {
      deleteEventGridSubscriptionFromArm(topicName, subscriptionName);
    }
  }
  if (resource.type.toLowerCase() === 'microsoft.eventgrid/topics') {
    deleteEventGridTopicFromArm(resource.name);
  }
  if (resource.type.toLowerCase() === 'microsoft.apimanagement/service/apis/operations') {
    const [serviceName, apiName, operationName] = resource.name.split('/');
    if (serviceName && apiName && operationName) {
      deleteApiManagementOperationFromArm(serviceName, apiName, operationName);
    }
  }
  if (resource.type.toLowerCase() === 'microsoft.apimanagement/service/apis') {
    const [serviceName, apiName] = resource.name.split('/');
    if (serviceName && apiName) {
      deleteApiManagementApiFromArm(serviceName, apiName);
    }
  }
  if (resource.type.toLowerCase() === 'microsoft.apimanagement/service') {
    deleteApiManagementServiceFromArm(resource.name);
  }
  if (resource.type.toLowerCase() === 'microsoft.operationalinsights/workspaces/tables') {
    const [workspaceName, tableName] = resource.name.split('/');
    if (workspaceName && tableName) {
      deleteLogAnalyticsTableFromArm(workspaceName, tableName);
    }
  }
  if (resource.type.toLowerCase() === 'microsoft.operationalinsights/workspaces') {
    deleteLogAnalyticsWorkspaceFromArm(resource.name);
  }
  armResources.delete(armResourceKey(resource.id));
}

function createOrUpdateDeployment(req: AzureParsedRequest, target: { id: string; name: string; resourceGroupName?: string }): ApiResponse {
  const body = req.body as { properties?: unknown };
  const properties = parseDeploymentProperties(body.properties);
  const template = parseDeploymentTemplate(properties?.template);
  if (!template) {
    return azureError('InvalidTemplate', 'Deployment template must be a JSON object.', 400);
  }

  const subscriptionId = req.subscriptionId ?? SUBSCRIPTION_ID;
  if (target.resourceGroupName && !resourceGroups.has(resourceGroupKey(subscriptionId, target.resourceGroupName))) {
    return azureError('ResourceGroupNotFound', `Resource group '${target.resourceGroupName}' could not be found.`, 404);
  }

  let result: ReturnType<typeof provisionArmTemplate>;
  try {
    result = provisionArmTemplate({
      template,
      deploymentName: target.name,
      parameters: properties?.parameters,
      subscriptionId,
      resourceGroupName: target.resourceGroupName,
      location: LOCATION,
      azureHttpsPort: req.azureHttpsPort,
    });
  } catch (err) {
    return azureError('InvalidTemplateDeployment', err instanceof Error ? err.message : String(err), 400);
  }

  for (const resource of result.resources) {
    persistResource(resource);
  }

  const deployment: ArmDeployment = {
    id: target.id,
    name: target.name,
    type: 'Microsoft.Resources/deployments',
    properties: {
      provisioningState: 'Succeeded',
      mode: typeof properties?.mode === 'string' ? properties.mode : 'Incremental',
      timestamp: new Date().toISOString(),
      duration: 'PT0S',
      templateHash: result.templateHash,
      parameters: result.parameters,
      outputs: result.outputs,
      outputResources: result.resources.map((resource) => ({ id: resource.id })),
    },
  };

  const existed = deployments.has(armResourceKey(target.id));
  deployments.set(armResourceKey(target.id), deployment);
  return jsonOk(deployment, existed ? 200 : 201);
}

function getDeployment(target: { id: string; name: string }): ApiResponse {
  const deployment = deployments.get(armResourceKey(target.id));
  if (!deployment) return azureError('DeploymentNotFound', `Deployment '${target.name}' could not be found.`, 404);
  return jsonOk(deployment);
}

function deleteDeployment(target: { id: string }): ApiResponse {
  deployments.delete(armResourceKey(target.id));
  return noContent(200);
}

function validateDeployment(req: AzureParsedRequest): ApiResponse {
  const target = parseDeploymentTarget({
    ...req,
    azurePath: req.azurePath.replace(/\/validate$/i, ''),
  });
  if (!target) return azureError('InvalidRequestUri', 'The request URI is invalid.', 400);
  const body = req.body as { properties?: unknown };
  const properties = parseDeploymentProperties(body.properties);
  const template = parseDeploymentTemplate(properties?.template);
  if (!template) {
    return azureError('InvalidTemplate', 'Deployment template must be a JSON object.', 400);
  }
  try {
    provisionArmTemplate({
      template,
      deploymentName: target.name,
      parameters: properties?.parameters,
      subscriptionId: req.subscriptionId ?? SUBSCRIPTION_ID,
      resourceGroupName: target.resourceGroupName,
      location: LOCATION,
      azureHttpsPort: req.azureHttpsPort,
    });
  } catch (err) {
    return azureError('InvalidTemplateDeployment', err instanceof Error ? err.message : String(err), 400);
  }
  return jsonOk({ properties: { provisioningState: 'Succeeded' } });
}

function parseDeploymentProperties(properties: unknown): { mode?: unknown; template?: unknown; parameters?: unknown } | null {
  if (typeof properties === 'string') {
    try {
      const parsed = JSON.parse(properties) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as { mode?: unknown; template?: unknown; parameters?: unknown }
        : null;
    } catch {
      return null;
    }
  }
  return properties && typeof properties === 'object' && !Array.isArray(properties)
    ? properties as { mode?: unknown; template?: unknown; parameters?: unknown }
    : null;
}

function parseDeploymentTemplate(template: unknown): Record<string, unknown> | null {
  if (typeof template === 'string') {
    try {
      const parsed = JSON.parse(template) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return template && typeof template === 'object' && !Array.isArray(template)
    ? template as Record<string, unknown>
    : null;
}

export function getArmResourcesByType(type: string): ArmGenericResource[] {
  const lower = type.toLowerCase();
  return Array.from(armResources.values()).filter((r) => r.type.toLowerCase() === lower);
}

function listResources(req: AzureParsedRequest): ApiResponse {
  const subscriptionId = req.subscriptionId ?? SUBSCRIPTION_ID;
  const groupName = parseResourceGroupName(req);
  const subscriptionPrefix = `/subscriptions/${subscriptionId}/`.toLowerCase();
  const groupPrefix = groupName ? `${resourceGroupId(subscriptionId, groupName).toLowerCase()}/` : null;
  const value = Array.from(armResources.values())
    .filter((resource) => resource.id.toLowerCase().startsWith(groupPrefix ?? subscriptionPrefix))
    .map(shapeResourceResponse);
  return jsonOk({ value, nextLink: null });
}

function createOrUpdateGenericResource(req: AzureParsedRequest, parsed: { id: string; name: string; type: string }): ApiResponse {
  const body = req.body as Record<string, unknown>;
  const resource: ArmGenericResource = {
    id: parsed.id,
    name: parsed.name,
    type: parsed.type,
    apiVersion: req.apiVersion,
  };
  if (typeof body.location === 'string') resource.location = body.location;
  if (typeof body.kind === 'string') resource.kind = body.kind;
  if (body.tags && typeof body.tags === 'object' && !Array.isArray(body.tags)) {
    resource.tags = Object.fromEntries(Object.entries(body.tags as Record<string, unknown>).map(([key, value]) => [key, String(value)]));
  }
  if (body.properties && typeof body.properties === 'object' && !Array.isArray(body.properties)) {
    resource.properties = body.properties as Record<string, unknown>;
  }
  if (body.sku !== undefined) resource.sku = body.sku;
  if (body.identity !== undefined) resource.identity = body.identity;

  const existed = armResources.has(armResourceKey(parsed.id));
  armResources.set(armResourceKey(parsed.id), resource);
  applyResourceSideEffects(resource);
  return jsonOk(resource, existed ? 200 : 201);
}

function getGenericResource(parsed: { id: string; name: string; type: string }): ApiResponse {
  const resource = armResources.get(armResourceKey(parsed.id));
  if (resource) return jsonOk(shapeResourceResponse(resource));
  const synthetic = synthesizeResource(parsed);
  if (synthetic) return jsonOk(synthetic);
  return azureError('ResourceNotFound', `Resource '${parsed.name}' could not be found.`, 404);
}

function synthesizeResource(parsed: { id: string; name: string; type: string }): ArmGenericResource | null {
  const parsedType = parsed.type.toLowerCase();
  if (parsedType === 'microsoft.web/sites/config') {
    const [siteName, configName] = parsed.name.split('/');
    if (!siteName || !configName) return null;
    const siteId = parsed.id.replace(/\/config\/[^/]+$/i, '');
    if (!armResources.has(armResourceKey(siteId))) return null;
    return {
      id: parsed.id,
      name: parsed.name,
      type: 'Microsoft.Web/sites/config',
      apiVersion: '2023-12-01',
      properties: defaultSiteConfigProperties(configName),
    };
  }
  if (parsedType === 'microsoft.web/sites/basicpublishingcredentialspolicies') {
    const [siteName, policyName] = parsed.name.split('/');
    if (!siteName || !policyName) return null;
    const siteId = parsed.id.replace(/\/basicPublishingCredentialsPolicies\/[^/]+$/i, '');
    if (!armResources.has(armResourceKey(siteId))) return null;
    return {
      id: parsed.id,
      name: parsed.name,
      type: 'Microsoft.Web/sites/basicPublishingCredentialsPolicies',
      apiVersion: '2023-12-01',
      properties: { allow: true },
    };
  }
  return null;
}

function defaultSiteConfigProperties(configName: string): Record<string, unknown> {
  if (configName.toLowerCase() === 'web') {
    return {
      linuxFxVersion: '',
      appSettings: [],
      alwaysOn: false,
      httpsOnly: true,
    };
  }
  if (configName.toLowerCase() === 'appsettings') {
    return {};
  }
  return {};
}

function shapeResourceResponse(resource: ArmGenericResource): ArmGenericResource {
  if (resource.type.toLowerCase() !== 'microsoft.web/sites') return resource;
  const properties = (resource.properties ?? {}) as Record<string, unknown>;
  const defaultHost = `${resource.name}.azurewebsites.net`;
  const scmHost = `${resource.name}.scm.azurewebsites.net`;
  const shaped: Record<string, unknown> = { ...properties };
  if (!('sku' in shaped)) shaped.sku = 'Dynamic';
  if (!('defaultHostName' in shaped)) shaped.defaultHostName = defaultHost;
  if (!('enabledHostNames' in shaped)) shaped.enabledHostNames = [defaultHost, scmHost];
  if (!('hostNames' in shaped)) shaped.hostNames = [defaultHost];
  if (!('hostNameSslStates' in shaped)) {
    shaped.hostNameSslStates = [
      { name: defaultHost, hostType: 'Standard', sslState: 'Disabled' },
      { name: scmHost, hostType: 'Repository', sslState: 'Disabled' },
    ];
  }
  if (!('state' in shaped)) shaped.state = 'Running';
  return { ...resource, properties: shaped };
}

function checkGenericResource(parsed: { id: string }): ApiResponse {
  if (!armResources.has(armResourceKey(parsed.id))) {
    return { statusCode: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '' };
  }
  return { statusCode: 204, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '' };
}

function deleteGenericResource(parsed: { id: string }): ApiResponse {
  const resource = armResources.get(armResourceKey(parsed.id));
  if (resource) deleteArmResource(resource);
  return noContent(200);
}

function parseResourceAction(
  req: AzureParsedRequest,
): { resourceId: string; resourceType: string; resourceName: string; action: string } | null {
  const parts = pathParts(req);
  const providerIndex = parts.findIndex((part) => part.toLowerCase() === 'providers');
  if (providerIndex === -1 || providerIndex + 3 >= parts.length) return null;
  if (parts[providerIndex + 1].toLowerCase() === 'microsoft.resources' &&
    parts[providerIndex + 2].toLowerCase() === 'deployments') {
    return null;
  }

  const namespace = parts[providerIndex + 1];
  const tail = parts.slice(providerIndex + 2);
  if (tail.length < 3 || tail.length % 2 !== 1) return null;

  const action = tail[tail.length - 1];
  const typeParts: string[] = [];
  const nameParts: string[] = [];
  for (let i = 0; i < tail.length - 1; i += 2) {
    typeParts.push(tail[i]);
    nameParts.push(tail[i + 1]);
  }

  const type = [namespace, ...typeParts].join('/');
  const name = nameParts.join('/');
  return {
    resourceId: buildArmResourceId(req.subscriptionId ?? SUBSCRIPTION_ID, req.resourceGroup, type, name),
    resourceType: type,
    resourceName: name,
    action,
  };
}

function handleResourceAction(
  req: AzureParsedRequest,
  action: { resourceId: string; resourceType: string; resourceName: string; action: string },
): ApiResponse | null {
  const siteBaseId = action.resourceId.replace(/\/config\/[^/]+$/i, '');
  const siteResource = armResources.get(armResourceKey(siteBaseId));

  const resourceType = action.resourceType.toLowerCase();
  const actionName = action.action.toLowerCase();

  if (
    siteResource &&
    resourceType === 'microsoft.web/sites/config' &&
    action.resourceName.toLowerCase().endsWith('/appsettings') &&
    actionName === 'list'
  ) {
    return jsonOk(siteAppSettingsListResponse(siteResource, action.resourceId));
  }

  if (
    siteResource &&
    resourceType === 'microsoft.web/sites/config' &&
    action.resourceName.toLowerCase().endsWith('/connectionstrings') &&
    actionName === 'list'
  ) {
    return jsonOk({
      id: action.resourceId,
      name: action.resourceName,
      type: 'Microsoft.Web/sites/config',
      properties: {},
    });
  }

  if (
    resourceType === 'microsoft.web/sites' &&
    actionName === 'publishxml'
  ) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: publishProfileXml(action.resourceName),
    };
  }

  if (
    resourceType === 'microsoft.web/sites/publishingcredentials' &&
    actionName === 'list'
  ) {
    const siteName = action.resourceName.split('/')[0];
    return jsonOk({
      id: action.resourceId,
      name: action.resourceName,
      type: 'Microsoft.Web/sites/publishingcredentials',
      properties: {
        publishingUserName: `$${siteName}`,
        publishingPassword: 'mockcloud',
        scmUri: `https://$${siteName}:mockcloud@${siteName}.scm.azurewebsites.net`,
      },
    });
  }

  if (
    resourceType === 'microsoft.web/sites/config' &&
    action.resourceName.toLowerCase().endsWith('/publishingcredentials') &&
    actionName === 'list'
  ) {
    const siteName = action.resourceName.split('/')[0];
    return jsonOk({
      id: action.resourceId,
      name: action.resourceName,
      type: 'Microsoft.Web/sites/config',
      properties: {
        publishingUserName: `$${siteName}`,
        publishingPassword: 'mockcloud',
        scmUri: `https://$${siteName}:mockcloud@${siteName}.scm.azurewebsites.net`,
      },
    });
  }

  if (
    resourceType === 'microsoft.cdn/profiles/afdendpoints' &&
    actionName === 'purge'
  ) {
    return {
      statusCode: 202,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: '',
    };
  }

  return null;
}

function siteAppSettingsListResponse(
  siteResource: ArmGenericResource,
  actionId: string,
): Record<string, unknown> {
  const siteConfig = (siteResource.properties?.siteConfig ?? {}) as Record<string, unknown>;
  const appSettingsArray = Array.isArray(siteConfig.appSettings) ? siteConfig.appSettings : [];
  const properties: Record<string, string> = {};
  for (const entry of appSettingsArray) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const name = (entry as Record<string, unknown>).name;
      const value = (entry as Record<string, unknown>).value;
      if (typeof name === 'string') {
        properties[name] = typeof value === 'string' ? value : '';
      }
    }
  }
  return {
    id: actionId.replace(/\/list$/i, ''),
    name: actionId.split('/').slice(-2)[0],
    type: 'Microsoft.Web/sites/config',
    properties,
  };
}

function functionAppStacks(): Array<Record<string, unknown>> {
  const nodeStackSettings = {
    linuxRuntimeSettings: {
      runtimeVersion: 'Node|22',
      isPreview: false,
      isDeprecated: false,
      isHidden: false,
      supportedFunctionsExtensionVersions: ['~4'],
      appInsightsSettings: { isSupported: true },
      gitHubActionSettings: { isSupported: true, supportedVersion: '22' },
      appSettingsDictionary: { FUNCTIONS_WORKER_RUNTIME: 'node', WEBSITE_NODE_DEFAULT_VERSION: '~22' },
      siteConfigPropertiesDictionary: { use32BitWorkerProcess: false, linuxFxVersion: 'Node|22' },
    },
    windowsRuntimeSettings: {
      runtimeVersion: '~22',
      isPreview: false,
      isDeprecated: false,
      isHidden: false,
      supportedFunctionsExtensionVersions: ['~4'],
      appInsightsSettings: { isSupported: true },
      gitHubActionSettings: { isSupported: true, supportedVersion: '22' },
      appSettingsDictionary: { FUNCTIONS_WORKER_RUNTIME: 'node', WEBSITE_NODE_DEFAULT_VERSION: '~22' },
      siteConfigPropertiesDictionary: { use32BitWorkerProcess: false },
    },
  };
  return [
    {
      id: '/providers/Microsoft.Web/functionAppStacks/node',
      name: 'node',
      type: 'Microsoft.Web/functionAppStacks',
      displayText: 'Node.js',
      value: 'node',
      majorVersions: [
        {
          displayText: 'Node.js 22',
          value: '22',
          minorVersions: [
            {
              displayText: 'Node.js 22 LTS',
              value: '22',
              stackSettings: nodeStackSettings,
            },
          ],
        },
      ],
      preferredOs: 'linux',
      properties: {
        displayText: 'Node.js',
        value: 'node',
        preferredOs: 'linux',
        majorVersions: [
          {
            displayText: 'Node.js 22',
            value: '22',
            minorVersions: [
              {
                displayText: 'Node.js 22 LTS',
                value: '22',
                stackSettings: nodeStackSettings,
              },
            ],
          },
        ],
      },
    },
  ];
}

function publishProfileXml(siteName: string): string {
  const host = siteName.split('/')[0];
  return `<?xml version="1.0" encoding="utf-8"?><publishData><publishProfile profileName="${host} - Web Deploy" publishMethod="MSDeploy" publishUrl="${host}.scm.azurewebsites.net:443" msdeploySite="${host}" userName="$${host}" userPWD="mockcloud" destinationAppUrl="https://${host}.azurewebsites.net" hostingProviderForumLink="" controlPanelLink="" webSystem="WebSites"/><publishProfile profileName="${host} - FTP" publishMethod="FTP" publishUrl="ftp://${host}.ftp.azurewebsites.windows.net/site/wwwroot" ftpPassiveMode="True" userName="${host}\\$${host}" userPWD="mockcloud" destinationAppUrl="https://${host}.azurewebsites.net" hostingProviderForumLink="" controlPanelLink="" webSystem="WebSites"/></publishData>`;
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  if (isSubscriptionsCollection(req) && req.method === 'GET') return listSubscriptions();
  if (isSubscriptionItem(req) && req.method === 'GET') return getSubscription(req);
  if (isTenantsCollection(req) && req.method === 'GET') return listTenants();

  if (req.azurePath.match(/^\/?providers\/Microsoft\.Web\/functionAppStacks\/?$/i) && req.method === 'GET') {
    return jsonOk({ value: functionAppStacks(), nextLink: null });
  }

  if (req.azurePath.match(/\/providers\/Microsoft\.Resources\/deployments\/[^/]+\/validate$/i) && req.method === 'POST') {
    return validateDeployment(req);
  }

  const deploymentTarget = parseDeploymentTarget(req);
  if (deploymentTarget) {
    switch (req.method) {
      case 'PUT': return createOrUpdateDeployment(req, deploymentTarget);
      case 'GET': return getDeployment(deploymentTarget);
      case 'DELETE': return deleteDeployment(deploymentTarget);
      default: return azureError('NotImplemented', 'The requested ARM deployment operation is not implemented.', 400);
    }
  }

  if (isResourcesCollection(req) && req.method === 'GET') return listResources(req);

  const action = parseResourceAction(req);
  if (action && req.method === 'POST') {
    const handled = handleResourceAction(req, action);
    if (handled) return handled;
  }

  const genericResource = parseProviderResourcePath(req);
  if (genericResource) {
    switch (req.method) {
      case 'PUT': return createOrUpdateGenericResource(req, genericResource);
      case 'GET': return getGenericResource(genericResource);
      case 'HEAD': return checkGenericResource(genericResource);
      case 'DELETE': return deleteGenericResource(genericResource);
    }
  }

  if (isResourceGroupsCollection(req) && req.method === 'GET') return listResourceGroups(req);

  const name = parseResourceGroupName(req);
  if (!name) {
    return azureError('InvalidRequestUri', 'The request URI is invalid.', 400);
  }

  switch (req.method) {
    case 'PUT': return createOrUpdateResourceGroup(req, name);
    case 'GET': return getResourceGroup(req, name);
    case 'HEAD': return checkResourceGroup(req, name);
    case 'DELETE': return deleteResourceGroup(req, name);
    default: return azureError('NotImplemented', 'The requested ARM operation is not implemented.', 400);
  }
}

export const azureArmService: AzureServiceDefinition = {
  name: 'azure-arm',
  hostPatterns: ['management.azure.com'],
  handlers: {
    _default: routeRequest,
  },
};
