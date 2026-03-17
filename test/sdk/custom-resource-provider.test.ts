import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProvisionContext } from '../../src/services/cloudformation/engine/types.js';
import type { StoredFunction } from '../../src/services/lambda/state.js';

const { executeLambdaHandlerMock } = vi.hoisted(() => ({
  executeLambdaHandlerMock: vi.fn(),
}));

vi.mock('../../src/services/lambda/executor.js', () => ({
  executeLambdaHandler: executeLambdaHandlerMock,
}));

import {
  customResourceProvider,
  customResourceStates,
} from '../../src/services/cloudformation/engine/providers/custom-resource.js';
import {
  functions,
  FAKE_CODE_SHA256,
  isoNow,
  makeFunctionArn,
} from '../../src/services/lambda/state.js';

const FUNCTION_NAME = 'custom-resource-handler';
const SERVICE_TOKEN = `arn:aws:lambda:us-east-1:123456789012:function:${FUNCTION_NAME}`;

function makeLambdaFunction(): StoredFunction {
  return {
    functionName: FUNCTION_NAME,
    functionArn: makeFunctionArn(FUNCTION_NAME),
    runtime: 'nodejs20.x',
    role: 'arn:aws:iam::123456789012:role/custom-resource',
    handler: 'index.handler',
    codeSize: 0,
    description: '',
    timeout: 3,
    memorySize: 128,
    lastModified: isoNow(),
    codeSha256: FAKE_CODE_SHA256,
    version: '$LATEST',
    environment: { Variables: {} },
    state: 'Active',
    lastUpdateStatus: 'Successful',
    tags: {},
  };
}

const context: ProvisionContext = {
  stackName: 'unit-custom-stack',
  region: 'us-east-1',
  accountId: '123456789012',
  resolvedResources: new Map(),
};

describe('customResourceProvider', () => {
  beforeEach(() => {
    executeLambdaHandlerMock.mockReset();
    if (functions.has(FUNCTION_NAME)) {
      functions.delete(FUNCTION_NAME);
    }
    customResourceStates.clear();
    functions.set(FUNCTION_NAME, makeLambdaFunction());
  });

  test('invokes Create, Update, and Delete lifecycle events', async () => {
    executeLambdaHandlerMock.mockResolvedValueOnce({
      result: {
        PhysicalResourceId: 'custom-1',
        Data: { Version: '1' },
      },
    });

    const created = await customResourceProvider.create('MyCustom', {
      ServiceToken: SERVICE_TOKEN,
      Value: 'one',
      __mockcloudResourceType: 'Custom::Thing',
    }, context);

    expect(created.physicalId).toBe('custom-1');
    expect(executeLambdaHandlerMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        RequestType: 'Create',
        ResourceType: 'Custom::Thing',
        ResourceProperties: {
          ServiceToken: SERVICE_TOKEN,
          Value: 'one',
        },
      }),
    );

    executeLambdaHandlerMock.mockResolvedValueOnce({
      result: {
        PhysicalResourceId: 'custom-1',
        Data: { Version: '2' },
      },
    });

    const updated = await customResourceProvider.update!(
      'custom-1',
      'MyCustom',
      {
        ServiceToken: SERVICE_TOKEN,
        Value: 'two',
        __mockcloudResourceType: 'Custom::Thing',
      },
      context,
    );

    expect(updated.physicalId).toBe('custom-1');
    expect(executeLambdaHandlerMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        RequestType: 'Update',
        PhysicalResourceId: 'custom-1',
        ResourceType: 'Custom::Thing',
        ResourceProperties: {
          ServiceToken: SERVICE_TOKEN,
          Value: 'two',
        },
        OldResourceProperties: {
          ServiceToken: SERVICE_TOKEN,
          Value: 'one',
        },
      }),
    );

    executeLambdaHandlerMock.mockResolvedValueOnce({
      result: {
        PhysicalResourceId: 'custom-1',
      },
    });

    await customResourceProvider.delete!('custom-1', context);

    expect(executeLambdaHandlerMock).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.objectContaining({
        RequestType: 'Delete',
        PhysicalResourceId: 'custom-1',
        ResourceType: 'Custom::Thing',
        ResourceProperties: {
          ServiceToken: SERVICE_TOKEN,
          Value: 'two',
        },
      }),
    );
    expect(customResourceStates.has('custom-1')).toBe(false);
  });

  test('fails when the ServiceToken Lambda does not exist', async () => {
    functions.delete(FUNCTION_NAME);

    await expect(customResourceProvider.create('MissingCustom', {
      ServiceToken: SERVICE_TOKEN,
      __mockcloudResourceType: 'Custom::Thing',
    }, context)).rejects.toThrow(`Custom resource handler not found: ${FUNCTION_NAME}`);

    expect(executeLambdaHandlerMock).not.toHaveBeenCalled();
    expect(customResourceStates.size).toBe(0);
  });

  test('fails when ServiceToken is missing', async () => {
    await expect(customResourceProvider.create('MissingCustom', {
      __mockcloudResourceType: 'Custom::Thing',
    }, context)).rejects.toThrow('Custom resource ServiceToken is required');

    expect(executeLambdaHandlerMock).not.toHaveBeenCalled();
    expect(customResourceStates.size).toBe(0);
  });

  test('fails when the handler returns FAILED status', async () => {
    executeLambdaHandlerMock.mockResolvedValueOnce({
      result: {
        Status: 'FAILED',
        Reason: 'bad custom resource',
        PhysicalResourceId: 'custom-1',
      },
    });

    await expect(customResourceProvider.create('MyCustom', {
      ServiceToken: SERVICE_TOKEN,
      Value: 'one',
      __mockcloudResourceType: 'Custom::Thing',
    }, context)).rejects.toThrow('bad custom resource');

    expect(customResourceStates.size).toBe(0);
  });
});
