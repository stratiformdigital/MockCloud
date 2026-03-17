import { PersistentMap } from '../../../../state/store.js';
import { randomUUID } from 'node:crypto';
import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { executeLambdaHandler } from '../../../lambda/executor.js';
import { functions } from '../../../lambda/state.js';
import { getBaseUrl } from '../../../../server-url.js';
import { REGION, ACCOUNT_ID } from '../../../../config.js';

function isLambdaArn(token: string): boolean {
  return token.startsWith('arn:aws:lambda:');
}

function extractFunctionName(arn: string): string {
  const parts = arn.split(':');
  return parts[parts.length - 1];
}

function requireLambdaServiceToken(serviceToken: unknown): string {
  if (typeof serviceToken !== 'string' || serviceToken.length === 0) {
    throw new Error('Custom resource ServiceToken is required');
  }
  if (!isLambdaArn(serviceToken)) {
    throw new Error(`Unsupported custom resource ServiceToken: ${serviceToken}`);
  }
  return serviceToken;
}

// CDK custom resource Lambdas PUT their response to ResponseURL instead of returning it
export const cfnResponses = new PersistentMap<string, Record<string, unknown>>('cfn-responses');
export interface CustomResourceState {
  physicalId: string;
  serviceToken: string;
  logicalId: string;
  stackName: string;
  resourceType: string;
  properties: Record<string, unknown>;
}

export const customResourceStates = new PersistentMap<string, CustomResourceState>('cfn-custom-resources');

function stripInternalProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (key.startsWith('__mockcloud')) continue;
    clean[key] = value;
  }
  return clean;
}

async function invokeLambda(
  serviceToken: string,
  logicalId: string,
  stackName: string,
  resourceType: string,
  requestType: 'Create' | 'Update' | 'Delete',
  properties: Record<string, unknown>,
  physicalResourceId?: string,
  oldProperties?: Record<string, unknown>,
): Promise<{ physicalResourceId?: string; data?: Record<string, string> }> {
  const functionName = extractFunctionName(serviceToken);
  const fn = functions.get(functionName);
  if (!fn) {
    throw new Error(`Custom resource handler not found: ${functionName}`);
  }

  const responseKey = randomUUID();
  const resourceProperties = stripInternalProperties(properties);
  const event = {
    RequestType: requestType,
    ServiceToken: serviceToken,
    ResponseURL: `${getBaseUrl()}/cfn-response/${responseKey}`,
    StackId: `arn:aws:cloudformation:${REGION}:${ACCOUNT_ID}:stack/${stackName}/${randomUUID()}`,
    RequestId: randomUUID(),
    ResourceType: resourceType,
    LogicalResourceId: logicalId,
    PhysicalResourceId: physicalResourceId,
    ResourceProperties: resourceProperties,
    OldResourceProperties: oldProperties ? stripInternalProperties(oldProperties) : undefined,
  };

  const execution = await executeLambdaHandler(fn, event);
  if (execution.error) {
    throw new Error(`${execution.error.errorType}: ${execution.error.errorMessage}`);
  }

  // Check if the Lambda returned a direct result (some CDK handlers do)
  let raw = execution.result as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object' || Object.keys(raw).length === 0) {
    // Check if the response was sent via ResponseURL PUT
    raw = cfnResponses.get(responseKey);
    cfnResponses.delete(responseKey);
  }

  if (!raw || typeof raw !== 'object') return {};

  const status = typeof raw.Status === 'string' ? raw.Status.toUpperCase() : undefined;
  if (status === 'FAILED') {
    const reason = typeof raw.Reason === 'string' ? raw.Reason : 'Custom resource returned FAILED';
    throw new Error(reason);
  }
  if (status && status !== 'SUCCESS') {
    throw new Error(`Custom resource returned invalid status: ${String(raw.Status)}`);
  }

  const returnedPhysicalResourceId = typeof raw.PhysicalResourceId === 'string'
    ? raw.PhysicalResourceId
    : undefined;

  const data: Record<string, string> = {};
  const rawData = raw.Data as Record<string, unknown> | undefined;
  if (rawData && typeof rawData === 'object') {
    for (const [k, v] of Object.entries(rawData)) {
      data[k] = String(v);
    }
  }

  return { physicalResourceId: returnedPhysicalResourceId, data };
}

export const customResourceProvider: ResourceProvider = {
  type: 'AWS::CloudFormation::CustomResource',
  async create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): Promise<ProvisionResult> {
    const defaultPhysicalId = `${context.stackName}-${logicalId}-${randomUUID().slice(0, 8)}`;
    const serviceToken = requireLambdaServiceToken(properties.ServiceToken);
    const resourceType = (properties.__mockcloudResourceType as string | undefined) ?? 'AWS::CloudFormation::CustomResource';

    const response = await invokeLambda(
      serviceToken,
      logicalId,
      context.stackName,
      resourceType,
      'Create',
      properties,
    );
    const physicalId = response.physicalResourceId ?? defaultPhysicalId;
    customResourceStates.set(physicalId, {
      physicalId,
      serviceToken,
      logicalId,
      stackName: context.stackName,
      resourceType,
      properties: stripInternalProperties(properties),
    });
    return {
      physicalId,
      attributes: response.data ?? {},
    };
  },
  async update(
    physicalId: string,
    logicalId: string,
    properties: Record<string, unknown>,
    context: ProvisionContext,
  ): Promise<ProvisionResult> {
    const previous = customResourceStates.get(physicalId);
    const serviceToken = requireLambdaServiceToken(properties.ServiceToken);
    const resourceType = (properties.__mockcloudResourceType as string | undefined)
      ?? previous?.resourceType
      ?? 'AWS::CloudFormation::CustomResource';

    const response = await invokeLambda(
      serviceToken,
      logicalId,
      context.stackName,
      resourceType,
      'Update',
      properties,
      physicalId,
      previous?.properties,
    );
    const nextPhysicalId = response.physicalResourceId ?? physicalId;
    if (nextPhysicalId !== physicalId) {
      customResourceStates.delete(physicalId);
    }
    customResourceStates.set(nextPhysicalId, {
      physicalId: nextPhysicalId,
      serviceToken,
      logicalId,
      stackName: context.stackName,
      resourceType,
      properties: stripInternalProperties(properties),
    });
    return {
      physicalId: nextPhysicalId,
      attributes: response.data ?? {},
    };
  },
  async delete(physicalId: string): Promise<void> {
    const resource = customResourceStates.get(physicalId);
    if (!resource) return;

    try {
      if (isLambdaArn(resource.serviceToken)) {
        await invokeLambda(
          resource.serviceToken,
          resource.logicalId,
          resource.stackName,
          resource.resourceType,
          'Delete',
          resource.properties,
          resource.physicalId,
          resource.properties,
        );
      }
    } finally {
      customResourceStates.delete(physicalId);
    }
  },
};
