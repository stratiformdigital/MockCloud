import { buckets } from './index.js';
import {
  functions,
  permissions,
  resolveFunctionName,
  type StoredFunction,
  type StoredPermission,
} from '../lambda/state.js';
import { executeLambdaHandler } from '../lambda/executor.js';
import { REGION, ACCOUNT_ID } from '../../config.js';
import { parseNotificationConfigurationXml } from './notification-configuration.js';

interface LambdaNotification {
  id: string;
  functionArn: string;
  events: string[];
  prefixFilter?: string;
  suffixFilter?: string;
}

function parseLambdaNotifications(xml: string): LambdaNotification[] {
  return (parseNotificationConfigurationXml(xml).LambdaFunctionConfigurations ?? [])
    .filter((config) => (config.Events?.length ?? 0) > 0)
    .map((config) => {
      let prefixFilter: string | undefined;
      let suffixFilter: string | undefined;
      for (const rule of config.Filter?.Key?.FilterRules ?? []) {
        const name = rule.Name.toLowerCase();
        const value = rule.Value;
        if (name === 'prefix') prefixFilter = value;
        if (name === 'suffix') suffixFilter = value;
      }

      return {
        id: config.Id ?? '',
        functionArn: config.LambdaFunctionArn,
        events: config.Events ?? [],
        prefixFilter,
        suffixFilter,
      };
    });
}

function eventMatches(configuredEvents: string[], eventName: string): boolean {
  for (const pattern of configuredEvents) {
    if (pattern === 's3:ObjectCreated:*' && eventName.startsWith('ObjectCreated:')) return true;
    if (pattern === 's3:ObjectRemoved:*' && eventName.startsWith('ObjectRemoved:')) return true;
    if (pattern === `s3:${eventName}`) return true;
  }
  return false;
}

function keyMatchesFilter(key: string, prefix?: string, suffix?: string): boolean {
  if (prefix !== undefined && !key.startsWith(prefix)) return false;
  if (suffix !== undefined && !key.endsWith(suffix)) return false;
  return true;
}

function actionAllowsInvoke(action: string): boolean {
  const normalized = action.toLowerCase();
  return normalized === '*' || normalized === 'lambda:*' || normalized === 'lambda:invokefunction';
}

function principalAllowsS3(principal: string): boolean {
  return principal === '*' || principal === 's3.amazonaws.com';
}

function sourceArnMatches(pattern: string | undefined, bucketArn: string): boolean {
  if (!pattern) return true;
  const segments = pattern
    .split('*')
    .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${segments.join('.*')}$`).test(bucketArn);
}

function hasS3InvokePermission(fn: StoredFunction, bucketName: string): boolean {
  const bucketArn = `arn:aws:s3:::${bucketName}`;
  return Array.from(permissions.values()).some((permission: StoredPermission) => (
    permission.functionName === fn.functionName
    && actionAllowsInvoke(permission.action)
    && principalAllowsS3(permission.principal)
    && sourceArnMatches(permission.sourceArn, bucketArn)
    && (!permission.sourceAccount || permission.sourceAccount === ACCOUNT_ID)
  ));
}

export type S3EventName =
  | 'ObjectCreated:Put'
  | 'ObjectCreated:Copy'
  | 'ObjectCreated:CompleteMultipartUpload'
  | 'ObjectRemoved:Delete';

export function dispatchS3Notifications(
  bucketName: string,
  objectKey: string,
  objectSize: number,
  etag: string,
  eventName: S3EventName,
): void {
  const bucket = buckets.get(bucketName);
  if (!bucket?.NotificationConfiguration) return;

  const notifications = parseLambdaNotifications(bucket.NotificationConfiguration);
  if (notifications.length === 0) return;

  for (const notification of notifications) {
    if (!eventMatches(notification.events, eventName)) continue;
    if (!keyMatchesFilter(objectKey, notification.prefixFilter, notification.suffixFilter)) continue;

    const functionName = resolveFunctionName(notification.functionArn);
    const fn = functions.get(functionName);
    if (!fn?.s3Bucket || !fn?.s3Key) continue;
    if (!hasS3InvokePermission(fn, bucketName)) continue;

    const event = {
      Records: [{
        eventVersion: '2.1',
        eventSource: 'aws:s3',
        awsRegion: REGION,
        eventTime: new Date().toISOString(),
        eventName,
        userIdentity: { principalId: ACCOUNT_ID },
        requestParameters: { sourceIPAddress: '127.0.0.1' },
        responseElements: {
          'x-amz-request-id': 'mockcloud',
          'x-amz-id-2': 'mockcloud',
        },
        s3: {
          s3SchemaVersion: '1.0',
          configurationId: notification.id,
          bucket: {
            name: bucketName,
            ownerIdentity: { principalId: ACCOUNT_ID },
            arn: `arn:aws:s3:::${bucketName}`,
          },
          object: {
            key: objectKey,
            size: objectSize,
            eTag: etag,
            sequencer: '0',
          },
        },
      }],
    };

    void executeLambdaHandler(fn, event).catch(() => undefined);
  }
}
