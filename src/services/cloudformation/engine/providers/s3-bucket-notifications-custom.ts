import type { ResourceProvider, ProvisionResult } from '../types.js';

// CDK's S3 BucketNotifications custom resource uses a Python Lambda
// that MockCloud can't execute. S3 event notifications are a no-op in MockCloud,
// so this provider returns success without invoking any Lambda.

export const s3BucketNotificationsCustomProvider: ResourceProvider = {
  type: 'Custom::S3BucketNotifications',
  create(logicalId: string): ProvisionResult {
    return {
      physicalId: logicalId,
      attributes: {},
    };
  },
  update(physicalId: string): ProvisionResult {
    return { physicalId, attributes: {} };
  },
  delete(): void {},
};
