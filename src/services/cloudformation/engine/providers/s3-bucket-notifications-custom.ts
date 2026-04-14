import { PersistentMap } from '../../../../state/store.js';
import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { buckets } from '../../../s3/index.js';
import {
  NOTIFICATION_LIST_KEYS,
  notificationConfigurationToXml,
  normalizeNotificationConfiguration,
  parseNotificationConfigurationXml,
  type LambdaFunctionNotificationConfiguration,
  type NotificationConfiguration,
  type NotificationConfigurationListKey,
  type QueueNotificationConfiguration,
  type TopicNotificationConfiguration,
} from '../../../s3/notification-configuration.js';

interface NotificationProviderState {
  physicalId: string;
  bucketName: string;
  managed: boolean;
  ownedIds: string[];
}

const notificationProviderStates = new PersistentMap<string, NotificationProviderState>('cfn-s3-bucket-notifications');

type NotificationListItem =
  | LambdaFunctionNotificationConfiguration
  | QueueNotificationConfiguration
  | TopicNotificationConfiguration;

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return fallback;
}

function requireBucketName(properties: Record<string, unknown>): string {
  const bucketName = properties.BucketName;
  if (typeof bucketName !== 'string' || bucketName.length === 0) {
    throw new Error('Custom::S3BucketNotifications BucketName is required');
  }
  if (!buckets.has(bucketName)) {
    throw new Error(`S3 bucket not found: ${bucketName}`);
  }
  return bucketName;
}

function getNotificationId(item: unknown): string | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const id = (item as { Id?: unknown }).Id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function getList(config: NotificationConfiguration, key: NotificationConfigurationListKey): NotificationListItem[] {
  switch (key) {
    case 'LambdaFunctionConfigurations':
      return config.LambdaFunctionConfigurations ?? [];
    case 'QueueConfigurations':
      return config.QueueConfigurations ?? [];
    case 'TopicConfigurations':
      return config.TopicConfigurations ?? [];
  }
}

function setList(config: NotificationConfiguration, key: NotificationConfigurationListKey, items: NotificationListItem[]): void {
  switch (key) {
    case 'LambdaFunctionConfigurations':
      config.LambdaFunctionConfigurations = items as LambdaFunctionNotificationConfiguration[];
      return;
    case 'QueueConfigurations':
      config.QueueConfigurations = items as QueueNotificationConfiguration[];
      return;
    case 'TopicConfigurations':
      config.TopicConfigurations = items as TopicNotificationConfiguration[];
      return;
  }
}

function assignOwnedIds(
  config: NotificationConfiguration,
  physicalId: string,
): { config: NotificationConfiguration; ownedIds: string[] } {
  const next: NotificationConfiguration = {};
  const ownedIds: string[] = [];

  for (const key of NOTIFICATION_LIST_KEYS) {
    const items = getList(config, key);
    if (items.length === 0) continue;
    setList(next, key, items.map((item, index) => {
      const id = item.Id || `${physicalId}-${key}-${index}`;
      ownedIds.push(id);
      return { ...item, Id: id };
    }));
  }

  if (config.EventBridgeConfiguration) {
    next.EventBridgeConfiguration = {};
  }

  return { config: next, ownedIds };
}

function removeOwnedNotifications(
  config: NotificationConfiguration,
  ownedIds: Set<string>,
  physicalId: string,
): NotificationConfiguration {
  const next: NotificationConfiguration = {};

  for (const key of NOTIFICATION_LIST_KEYS) {
    const items = getList(config, key);
    const external = items.filter((item) => {
      const id = getNotificationId(item);
      return !id || (!ownedIds.has(id) && !id.startsWith(`${physicalId}-`));
    });
    if (external.length > 0) {
      setList(next, key, external);
    }
  }

  if (config.EventBridgeConfiguration) {
    next.EventBridgeConfiguration = {};
  }

  return next;
}

function mergeNotificationConfigurations(
  external: NotificationConfiguration,
  incoming: NotificationConfiguration,
): NotificationConfiguration {
  const merged: NotificationConfiguration = {};

  for (const key of NOTIFICATION_LIST_KEYS) {
    const items = [...getList(external, key), ...getList(incoming, key)];
    if (items.length > 0) {
      setList(merged, key, items);
    }
  }

  if (incoming.EventBridgeConfiguration) {
    merged.EventBridgeConfiguration = {};
  } else if (external.EventBridgeConfiguration) {
    merged.EventBridgeConfiguration = {};
  }

  return merged;
}

function writeBucketNotificationConfiguration(bucketName: string, config: NotificationConfiguration): void {
  const bucket = buckets.get(bucketName);
  if (!bucket) throw new Error(`S3 bucket not found: ${bucketName}`);
  bucket.NotificationConfiguration = notificationConfigurationToXml(config);
  buckets.set(bucketName, bucket);
}

function applyConfig(
  physicalId: string,
  properties: Record<string, unknown>,
  previous?: NotificationProviderState,
): NotificationProviderState {
  const bucketName = requireBucketName(properties);
  const managed = asBoolean(properties.Managed, true);
  const incoming = normalizeNotificationConfiguration(properties.NotificationConfiguration);

  if (managed) {
    writeBucketNotificationConfiguration(bucketName, incoming);
    return { physicalId, bucketName, managed, ownedIds: [] };
  }

  const bucket = buckets.get(bucketName)!;
  const existing = parseNotificationConfigurationXml(bucket.NotificationConfiguration);
  const external = removeOwnedNotifications(
    existing,
    new Set(previous?.ownedIds ?? []),
    physicalId,
  );
  const owned = assignOwnedIds(incoming, physicalId);
  writeBucketNotificationConfiguration(bucketName, mergeNotificationConfigurations(external, owned.config));
  return { physicalId, bucketName, managed, ownedIds: owned.ownedIds };
}

export const s3BucketNotificationsCustomProvider: ResourceProvider = {
  type: 'Custom::S3BucketNotifications',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const physicalId = `${context.stackName}-${logicalId}`;
    const state = applyConfig(physicalId, properties);
    notificationProviderStates.set(physicalId, state);
    return {
      physicalId,
      attributes: {},
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const state = applyConfig(physicalId, properties, notificationProviderStates.get(physicalId));
    notificationProviderStates.set(physicalId, state);
    return { physicalId, attributes: {} };
  },
  delete(physicalId: string): void {
    const state = notificationProviderStates.get(physicalId);
    if (!state) return;

    const bucket = buckets.get(state.bucketName);
    if (bucket) {
      if (state.managed) {
        bucket.NotificationConfiguration = notificationConfigurationToXml({});
        buckets.set(state.bucketName, bucket);
      } else {
        const existing = parseNotificationConfigurationXml(bucket.NotificationConfiguration);
        writeBucketNotificationConfiguration(
          state.bucketName,
          removeOwnedNotifications(existing, new Set(state.ownedIds), physicalId),
        );
      }
    }

    notificationProviderStates.delete(physicalId);
  },
};
