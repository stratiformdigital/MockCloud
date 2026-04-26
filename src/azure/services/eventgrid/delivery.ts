import { randomUUID } from 'node:crypto';
import { getArmResourcesByType } from '../arm/index.js';
import { enqueueForTest as enqueueServiceBusMessage } from '../service-bus/broker.js';
import { info } from '../../../util/logger.js';

type EventGridEvent = {
  id: string;
  topic: string;
  subject: string;
  eventType: string;
  eventTime: string;
  dataVersion: string;
  data: Record<string, unknown>;
};

function isMatchingSubscription(
  subscription: Record<string, unknown>,
  eventType: string,
  subject: string,
  scopeId: string,
): boolean {
  const properties = (subscription.properties ?? {}) as Record<string, unknown>;
  const filter = (properties.filter ?? {}) as Record<string, unknown>;
  const includedTypes = Array.isArray(filter.includedEventTypes)
    ? (filter.includedEventTypes as string[])
    : null;
  if (includedTypes && !includedTypes.some((t) => t.toLowerCase() === eventType.toLowerCase())) {
    return false;
  }
  const subjectBegins = typeof filter.subjectBeginsWith === 'string' ? (filter.subjectBeginsWith as string) : '';
  if (subjectBegins && !subject.toLowerCase().startsWith(subjectBegins.toLowerCase())) {
    return false;
  }
  const subjectEnds = typeof filter.subjectEndsWith === 'string' ? (filter.subjectEndsWith as string) : '';
  if (subjectEnds && !subject.toLowerCase().endsWith(subjectEnds.toLowerCase())) {
    return false;
  }

  const subscriptionScope = typeof properties.topic === 'string' ? (properties.topic as string) : '';
  const subscriptionId = typeof subscription.id === 'string' ? (subscription.id as string) : '';
  if (subscriptionScope && !scopeId.toLowerCase().includes(subscriptionScope.toLowerCase())) {
    return false;
  }
  if (!subscriptionScope && subscriptionId && !subscriptionId.toLowerCase().includes(scopeIdShortName(scopeId))) {
    return false;
  }
  return true;
}

function scopeIdShortName(scopeId: string): string {
  const parts = scopeId.split('/');
  return parts[parts.length - 1].toLowerCase();
}

function deliverToServiceBus(destination: Record<string, unknown>, event: EventGridEvent): void {
  const properties = (destination.properties ?? {}) as Record<string, unknown>;
  const resourceId = typeof properties.resourceId === 'string' ? (properties.resourceId as string) : '';
  if (!resourceId) return;
  const queueMatch = resourceId.match(/\/queues\/([^/]+)$/i);
  if (!queueMatch) return;
  const queueName = queueMatch[1];
  const nsMatch = resourceId.match(/\/namespaces\/([^/]+)\//i);
  const address = nsMatch ? `${nsMatch[1]}/${queueName}` : queueName;
  enqueueServiceBusMessage(address, [event]);
  info(`[eventgrid] delivered ${event.eventType} to service bus queue ${address}`);
}

export function publishBlobCreated(
  storageAccount: string,
  container: string,
  blobName: string,
  size: number,
  contentType: string,
): void {
  const subject = `/blobServices/default/containers/${container}/blobs/${blobName}`;
  const scopeId = `/providers/Microsoft.Storage/storageAccounts/${storageAccount}`;
  const event: EventGridEvent = {
    id: randomUUID(),
    topic: scopeId,
    subject,
    eventType: 'Microsoft.Storage.BlobCreated',
    eventTime: new Date().toISOString(),
    dataVersion: '2',
    data: {
      api: 'PutBlob',
      clientRequestId: randomUUID(),
      requestId: randomUUID(),
      eTag: '0x0',
      contentType,
      contentLength: size,
      blobType: 'BlockBlob',
      url: `https://${storageAccount}.blob.core.windows.net/${container}/${blobName}`,
      sequencer: '0',
      storageDiagnostics: { batchId: randomUUID() },
    },
  };

  const subscriptions = getArmResourcesByType('Microsoft.EventGrid/eventSubscriptions');
  for (const subscription of subscriptions) {
    if (!isMatchingSubscription(subscription as unknown as Record<string, unknown>, event.eventType, subject, scopeId)) {
      continue;
    }
    const properties = (subscription.properties ?? {}) as Record<string, unknown>;
    const destination = (properties.destination ?? {}) as Record<string, unknown>;
    const endpointType = typeof destination.endpointType === 'string' ? (destination.endpointType as string) : '';
    if (endpointType.toLowerCase() === 'servicebusqueue') {
      deliverToServiceBus(destination, event);
    }
  }
}
