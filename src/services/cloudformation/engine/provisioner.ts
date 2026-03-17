import type { ParsedTemplate, ResourceProvider, ProvisionContext, ResolvedResource } from './types.js';
import { getCreationOrder } from './dependency-graph.js';
import { resolveIntrinsic, resolveValue, evaluateConditions, type IntrinsicContext } from './intrinsics.js';
import { stacks } from '../state.js';
import { getBaseUrl } from '../../../server-url.js';
import { ACCOUNT_ID } from '../../../config.js';
import { info } from '../../../util/logger.js';

export interface ProvisionedStack {
  resources: Array<{
    logicalId: string;
    physicalId: string;
    type: string;
    status: string;
  }>;
  outputs: Array<{
    key: string;
    value: string;
    description?: string;
    exportName?: string;
  }>;
}

export class ProvisionError extends Error {
  readonly resources: ProvisionedStack['resources'];

  constructor(message: string, resources: ProvisionedStack['resources']) {
    super(message);
    this.name = 'ProvisionError';
    this.resources = resources;
  }
}

const providers = new Map<string, ResourceProvider>();

export function registerProvider(provider: ResourceProvider): void {
  providers.set(provider.type, provider);
}

function buildIntrinsicContext(
  stackName: string,
  region: string,
  parameters: Record<string, string>,
  resolvedResources: Map<string, ResolvedResource>,
): IntrinsicContext {
  const cfnExports = new Map<string, string>();
  for (const stack of stacks.values()) {
    for (const output of stack.outputs) {
      if (output.ExportName) {
        cfnExports.set(output.ExportName, output.OutputValue ?? '');
      }
    }
  }

  return {
    stackName,
    region,
    accountId: ACCOUNT_ID,
    resolvedResources,
    parameters,
    conditions: {},
    evaluatedConditions: {},
    exports: cfnExports,
  };
}

function unsupportedResources(
  template: ParsedTemplate,
  evaluatedConditions: Record<string, boolean>,
): string[] {
  const order = getCreationOrder(template.resources);
  const unsupported: string[] = [];

  for (const logicalId of order) {
    const resource = template.resources[logicalId];
    if (resource.Type === 'AWS::CDK::Metadata') continue;
    if (resource.Condition && evaluatedConditions[resource.Condition] === false) continue;
    const hasProvider = providers.has(resource.Type)
      || (resource.Type.startsWith('Custom::') && providers.has('AWS::CloudFormation::CustomResource'));
    if (!hasProvider) unsupported.push(`${logicalId} (${resource.Type})`);
  }

  return unsupported;
}

export function validateSupportedTemplate(
  template: ParsedTemplate,
  stackName: string,
  parameters: Record<string, string>,
  region: string,
): void {
  const intrinsicContext = buildIntrinsicContext(
    stackName,
    region,
    parameters,
    new Map(),
  );
  const evaluatedConditions = evaluateConditions(template.conditions, intrinsicContext);
  intrinsicContext.conditions = template.conditions;
  intrinsicContext.evaluatedConditions = evaluatedConditions;

  const unsupported = unsupportedResources(template, evaluatedConditions);
  if (unsupported.length > 0) {
    throw new Error(`Unsupported resource types: ${unsupported.join(', ')}`);
  }
}

export async function provision(
  template: ParsedTemplate,
  stackName: string,
  parameters: Record<string, string>,
  region: string,
  existingResources = new Map<string, { physicalId: string; type: string }>(),
): Promise<ProvisionedStack> {
  const resolvedResources = new Map<string, ResolvedResource>();

  const context: ProvisionContext = {
    stackName,
    region,
    accountId: ACCOUNT_ID,
    resolvedResources,
  };

  const intrinsicContext = buildIntrinsicContext(
    stackName,
    region,
    parameters,
    resolvedResources,
  );

  const evaluatedConditions = evaluateConditions(template.conditions, intrinsicContext);
  intrinsicContext.conditions = template.conditions;
  intrinsicContext.evaluatedConditions = evaluatedConditions;

  const order = getCreationOrder(template.resources);
  const results: ProvisionedStack['resources'] = [];

  const unsupported = unsupportedResources(template, evaluatedConditions);
  if (unsupported.length > 0) {
    throw new Error(`Unsupported resource types: ${unsupported.join(', ')}`);
  }

  try {
    for (const logicalId of order) {
      const resource = template.resources[logicalId];

      if (resource.Type === 'AWS::CDK::Metadata') continue;

      if (resource.Condition) {
        const conditionResult = evaluatedConditions[resource.Condition];
        if (conditionResult === false) {
          continue;
        }
      }

      const provider = providers.get(resource.Type)
        ?? (resource.Type.startsWith('Custom::') ? providers.get('AWS::CloudFormation::CustomResource') : undefined);
      if (!provider) continue;

      const resolvedProps = resolveProperties(resource.Properties, intrinsicContext);
      if (resource.Type === 'AWS::CloudFormation::CustomResource' || resource.Type.startsWith('Custom::')) {
        resolvedProps.__mockcloudResourceType = resource.Type;
      }

      const existing = existingResources.get(logicalId);
      const isUpdate = !!(existing && existing.type === resource.Type && provider.update);
      info(`[CFN] ${stackName}: ${isUpdate ? 'Updating' : 'Creating'} ${resource.Type} ${logicalId}`);
      const result = isUpdate
        ? await provider.update!(existing!.physicalId, logicalId, resolvedProps, context)
        : await provider.create(logicalId, resolvedProps, context);

      if (!isUpdate) {
        for (const otherStack of stacks.values()) {
          if (otherStack.stackName === stackName || otherStack.stackStatus === 'DELETE_COMPLETE') continue;
          for (const r of otherStack.resources) {
            if (r.physicalResourceId === result.physicalId && r.resourceType === resource.Type) {
              throw new Error(`${resource.Type} '${result.physicalId}' already exists in stack '${otherStack.stackName}'`);
            }
          }
        }
      }

      resolvedResources.set(logicalId, { physicalId: result.physicalId, attributes: result.attributes });
      results.push({ logicalId, physicalId: result.physicalId, type: resource.Type, status: 'CREATE_COMPLETE' });
    }

    const outputs: ProvisionedStack['outputs'] = [];
    for (const [key, outputDef] of Object.entries(template.outputs)) {
      if (outputDef.Condition) {
        const conditionResult = evaluatedConditions[outputDef.Condition];
        if (conditionResult === false) continue;
      }
      const value = resolveValue(outputDef.Value, intrinsicContext);
      const rewritten = value.replace(/^https?:\/\/([\w.-]+\.execute-api\.[\w.-]+\.amazonaws\.com)/, `${getBaseUrl()}/api/$1`);
      const entry: ProvisionedStack['outputs'][0] = { key, value: rewritten };
      if (outputDef.Description) entry.description = outputDef.Description;
      if (outputDef.Export?.Name) {
        entry.exportName = resolveValue(outputDef.Export.Name, intrinsicContext);
      }
      outputs.push(entry);
    }

    return { resources: results, outputs };
  } catch (err) {
    const message = err instanceof AggregateError
      ? err.errors.map(e => e instanceof Error ? e.message : String(e)).join('; ') || err.message
      : err instanceof Error ? err.message : String(err);
    throw new ProvisionError(message, results);
  }
}

export async function destroyProvisionedResources(
  resources: Array<{ physicalId: string; type: string }>,
  stackName: string,
  region: string,
): Promise<void> {
  const context: ProvisionContext = {
    stackName,
    region,
    accountId: ACCOUNT_ID,
    resolvedResources: new Map(),
  };

  for (const resource of [...resources].reverse()) {
    const provider = providers.get(resource.type)
      ?? (resource.type.startsWith('Custom::') ? providers.get('AWS::CloudFormation::CustomResource') : undefined);
    if (!provider?.delete) continue;
    await provider.delete(resource.physicalId, context);
  }
}

function resolveProperties(
  properties: Record<string, unknown> | undefined,
  context: IntrinsicContext,
): Record<string, unknown> {
  if (!properties) {
    return {};
  }
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    resolved[key] = resolveIntrinsic(value, context);
  }
  return resolved;
}
