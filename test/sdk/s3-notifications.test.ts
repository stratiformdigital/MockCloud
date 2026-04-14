import { randomUUID } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import type { ProvisionContext } from '../../src/services/cloudformation/engine/types.js';
import type { StoredFunction } from '../../src/services/lambda/state.js';

const { executeLambdaHandlerMock } = vi.hoisted(() => ({
  executeLambdaHandlerMock: vi.fn(),
}));

vi.mock('../../src/services/lambda/executor.js', () => ({
  executeLambdaHandler: executeLambdaHandlerMock,
}));

import { s3BucketNotificationsCustomProvider } from '../../src/services/cloudformation/engine/providers/s3-bucket-notifications-custom.js';
import { buckets, createBucket, deleteBucket, deleteObject, putObject, s3Service } from '../../src/services/s3/index.js';
import { parseNotificationConfigurationXml } from '../../src/services/s3/notification-configuration.js';
import { dispatchS3Notifications } from '../../src/services/s3/notifications.js';
import {
  FAKE_CODE_SHA256,
  functions,
  isoNow,
  makeFunctionArn,
  permissions,
} from '../../src/services/lambda/state.js';

function makeFunction(functionName: string): StoredFunction {
  return {
    functionName,
    functionArn: makeFunctionArn(functionName),
    runtime: 'nodejs20.x',
    role: 'arn:aws:iam::000000000000:role/lambda-role',
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
    s3Bucket: 'code-bucket',
    s3Key: 'handler.zip',
  };
}

const context: ProvisionContext = {
  stackName: 'unit-s3-notifications',
  region: 'us-east-1',
  accountId: '000000000000',
  resolvedResources: new Map(),
};

describe('S3 notifications', () => {
  test('requires an S3 Lambda permission before dispatching', () => {
    const suffix = randomUUID();
    const bucketName = `notif-permission-${suffix}`;
    const functionName = `notif-fn-${suffix}`;
    const permissionId = `notif-permission-${suffix}`;

    executeLambdaHandlerMock.mockReset();
    executeLambdaHandlerMock.mockResolvedValue({ result: undefined });
    createBucket(bucketName, 'us-east-1');
    functions.set(functionName, makeFunction(functionName));

    const bucket = buckets.get(bucketName)!;
    bucket.NotificationConfiguration = `<NotificationConfiguration><LambdaFunctionConfiguration><CloudFunction>${makeFunctionArn(functionName)}</CloudFunction><Event>s3:ObjectCreated:Put</Event></LambdaFunctionConfiguration></NotificationConfiguration>`;
    buckets.set(bucketName, bucket);

    try {
      dispatchS3Notifications(bucketName, 'incoming.txt', 5, '"etag"', 'ObjectCreated:Put');
      expect(executeLambdaHandlerMock).not.toHaveBeenCalled();

      permissions.set(permissionId, {
        id: permissionId,
        functionName,
        functionArn: makeFunctionArn(functionName),
        action: 'lambda:InvokeFunction',
        principal: 's3.amazonaws.com',
        sourceArn: `arn:aws:s3:::${bucketName}`,
      });

      dispatchS3Notifications(bucketName, 'incoming.txt', 5, '"etag"', 'ObjectCreated:Put');
      expect(executeLambdaHandlerMock).toHaveBeenCalledTimes(1);
      expect(executeLambdaHandlerMock).toHaveBeenCalledWith(
        expect.objectContaining({ functionName }),
        expect.objectContaining({
          Records: [
            expect.objectContaining({
              eventName: 'ObjectCreated:Put',
              s3: expect.objectContaining({
                bucket: expect.objectContaining({ name: bucketName }),
                object: expect.objectContaining({ key: 'incoming.txt' }),
              }),
            }),
          ],
        }),
      );
    } finally {
      permissions.delete(permissionId);
      functions.delete(functionName);
      deleteBucket(bucketName);
    }
  });

  test('custom provider removes unmanaged notifications without removing external ones', () => {
    const bucketName = `notif-provider-${randomUUID()}`;
    createBucket(bucketName, 'us-east-1');
    const bucket = buckets.get(bucketName)!;
    bucket.NotificationConfiguration = '<NotificationConfiguration><QueueConfiguration><Id>external</Id><Queue>arn:aws:sqs:us-east-1:000000000000:external</Queue><Event>s3:ObjectCreated:Put</Event></QueueConfiguration></NotificationConfiguration>';
    buckets.set(bucketName, bucket);

    let physicalId: string | undefined;

    try {
      const created = s3BucketNotificationsCustomProvider.create('Notifications', {
        BucketName: bucketName,
        Managed: false,
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [{
            LambdaFunctionArn: 'arn:aws:lambda:us-east-1:000000000000:function:target',
            Events: ['s3:ObjectCreated:Put'],
          }],
        },
      }, context);
      physicalId = created.physicalId;

      const applied = parseNotificationConfigurationXml(buckets.get(bucketName)!.NotificationConfiguration);
      expect(applied.QueueConfigurations).toHaveLength(1);
      expect(applied.LambdaFunctionConfigurations).toHaveLength(1);

      s3BucketNotificationsCustomProvider.delete!(physicalId, context);
      physicalId = undefined;

      const afterDelete = parseNotificationConfigurationXml(buckets.get(bucketName)!.NotificationConfiguration);
      expect(afterDelete.QueueConfigurations).toEqual([
        expect.objectContaining({ Id: 'external' }),
      ]);
      expect(afterDelete.LambdaFunctionConfigurations ?? []).toHaveLength(0);
    } finally {
      if (physicalId) s3BucketNotificationsCustomProvider.delete!(physicalId, context);
      deleteBucket(bucketName);
    }
  });

  test('dispatches ObjectRemoved notifications when an existing object is deleted', async () => {
    const suffix = randomUUID();
    const bucketName = `notif-delete-${suffix}`;
    const functionName = `notif-delete-fn-${suffix}`;
    const permissionId = `notif-delete-permission-${suffix}`;

    executeLambdaHandlerMock.mockReset();
    executeLambdaHandlerMock.mockResolvedValue({ result: undefined });
    createBucket(bucketName, 'us-east-1');
    functions.set(functionName, makeFunction(functionName));
    permissions.set(permissionId, {
      id: permissionId,
      functionName,
      functionArn: makeFunctionArn(functionName),
      action: 'lambda:InvokeFunction',
      principal: 's3.amazonaws.com',
      sourceArn: `arn:aws:s3:::${bucketName}`,
    });
    putObject(bucketName, 'incoming/delete-me.txt', Buffer.from('hello'), {
      contentType: 'text/plain',
      etag: '"etag"',
      lastModified: new Date().toISOString(),
      metadata: {},
    });

    const bucket = buckets.get(bucketName)!;
    bucket.NotificationConfiguration = `<NotificationConfiguration><CloudFunctionConfiguration><CloudFunction>${makeFunctionArn(functionName)}</CloudFunction><Event>s3:ObjectRemoved:*</Event><Filter><S3Key><FilterRule><Name>prefix</Name><Value>incoming/</Value></FilterRule></S3Key></Filter></CloudFunctionConfiguration></NotificationConfiguration>`;
    buckets.set(bucketName, bucket);

    try {
      const response = await s3Service.handlers._default({
        action: '',
        body: {},
        rawBody: Buffer.alloc(0),
        headers: {},
        queryParams: {},
        path: `/${bucketName}/incoming/delete-me.txt`,
        method: 'DELETE',
      });

      expect(response.statusCode).toBe(204);
      expect(executeLambdaHandlerMock).toHaveBeenCalledTimes(1);
      expect(executeLambdaHandlerMock).toHaveBeenCalledWith(
        expect.objectContaining({ functionName }),
        expect.objectContaining({
          Records: [
            expect.objectContaining({
              eventName: 'ObjectRemoved:Delete',
              s3: expect.objectContaining({
                bucket: expect.objectContaining({ name: bucketName }),
                object: expect.objectContaining({ key: 'incoming/delete-me.txt' }),
              }),
            }),
          ],
        }),
      );
    } finally {
      permissions.delete(permissionId);
      functions.delete(functionName);
      deleteObject(bucketName, 'incoming/delete-me.txt');
      deleteBucket(bucketName);
    }
  });
});
