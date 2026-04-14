import { randomUUID } from 'node:crypto';
import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import {
  functions,
  permissions,
  eventSourceMappings,
  isoNow,
  makeQualifiedFunctionArn,
  resolveFunctionName,
  resolveFunctionTarget,
} from '../../../lambda/state.js';

function resolveLambdaArn(identifier: string): { functionName: string; functionArn: string } {
  const target = resolveFunctionTarget(identifier);
  const functionName = resolveFunctionName(target.functionName);
  const fn = functions.get(functionName);
  if (!fn) {
    throw new Error(`Lambda function not found: ${functionName}`);
  }

  return {
    functionName,
    functionArn: target.qualifier === '$LATEST'
      ? fn.functionArn
      : makeQualifiedFunctionArn(functionName, target.qualifier),
  };
}

function normalizePrincipal(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '*';

  const record = value as Record<string, unknown>;
  const service = record.Service;
  if (typeof service === 'string') return service;
  if (Array.isArray(service) && typeof service[0] === 'string') return service[0];

  const aws = record.AWS;
  if (typeof aws === 'string') return aws;
  if (Array.isArray(aws) && typeof aws[0] === 'string') return aws[0];

  return '*';
}

export const lambdaPermissionProvider: ResourceProvider = {
  type: 'AWS::Lambda::Permission',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const physicalId = `${context.stackName}-${logicalId}-permission`;
    const { functionName, functionArn } = resolveLambdaArn(properties.FunctionName as string);
    permissions.set(physicalId, {
      id: physicalId,
      functionName,
      functionArn,
      action: (properties.Action as string) ?? 'lambda:InvokeFunction',
      principal: normalizePrincipal(properties.Principal),
      sourceArn: properties.SourceArn as string | undefined,
      sourceAccount: properties.SourceAccount as string | undefined,
      eventSourceToken: properties.EventSourceToken as string | undefined,
      functionUrlAuthType: properties.FunctionUrlAuthType as string | undefined,
      principalOrgId: properties.PrincipalOrgID as string | undefined,
    });

    return {
      physicalId,
      attributes: {},
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const { functionName, functionArn } = resolveLambdaArn(properties.FunctionName as string);
    permissions.set(physicalId, {
      id: physicalId,
      functionName,
      functionArn,
      action: (properties.Action as string) ?? 'lambda:InvokeFunction',
      principal: normalizePrincipal(properties.Principal),
      sourceArn: properties.SourceArn as string | undefined,
      sourceAccount: properties.SourceAccount as string | undefined,
      eventSourceToken: properties.EventSourceToken as string | undefined,
      functionUrlAuthType: properties.FunctionUrlAuthType as string | undefined,
      principalOrgId: properties.PrincipalOrgID as string | undefined,
    });
    return {
      physicalId,
      attributes: {},
    };
  },
  delete(physicalId: string): void {
    permissions.delete(physicalId);
  },
};

export const lambdaEventSourceMappingProvider: ResourceProvider = {
  type: 'AWS::Lambda::EventSourceMapping',
  create(_logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const physicalId = randomUUID();
    const { functionName, functionArn } = resolveLambdaArn(properties.FunctionName as string);
    const enabled = (properties.Enabled as boolean | undefined) ?? true;
    eventSourceMappings.set(physicalId, {
      uuid: physicalId,
      functionName,
      functionArn,
      eventSourceArn: properties.EventSourceArn as string | undefined,
      batchSize: properties.BatchSize as number | undefined,
      enabled,
      state: enabled ? 'Enabled' : 'Disabled',
      lastModified: isoNow(),
      startingPosition: properties.StartingPosition as string | undefined,
    });

    return {
      physicalId,
      attributes: { EventSourceMappingId: physicalId },
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const { functionName, functionArn } = resolveLambdaArn(properties.FunctionName as string);
    const enabled = (properties.Enabled as boolean | undefined) ?? true;
    eventSourceMappings.set(physicalId, {
      uuid: physicalId,
      functionName,
      functionArn,
      eventSourceArn: properties.EventSourceArn as string | undefined,
      batchSize: properties.BatchSize as number | undefined,
      enabled,
      state: enabled ? 'Enabled' : 'Disabled',
      lastModified: isoNow(),
      startingPosition: properties.StartingPosition as string | undefined,
    });
    return {
      physicalId,
      attributes: { EventSourceMappingId: physicalId },
    };
  },
  delete(physicalId: string): void {
    eventSourceMappings.delete(physicalId);
  },
};
