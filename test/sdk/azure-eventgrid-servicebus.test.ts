import { afterEach, describe, expect, test } from 'vitest';
import rhea from 'rhea';
import type { Connection, EventContext } from 'rhea';
import { createBlobServiceClient, AZURE_SUBSCRIPTION_ID, AZURE_STORAGE_ACCOUNT } from './azure-client-factory.js';
import { getTestEndpoint } from './client-factory.js';

const { create_container } = rhea;

const SERVICE_BUS_PORT = 5672;
const activeConnections: Connection[] = [];

afterEach(async () => {
  while (activeConnections.length > 0) {
    const conn = activeConnections.pop();
    try {
      conn?.close();
    } catch {
      /* ignore */
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
});

function openConnection(hostname?: string): Promise<Connection> {
  const container = create_container({ container_id: `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}` });
  return new Promise((resolve, reject) => {
    const connection = container.connect({
      host: 'localhost',
      hostname,
      port: SERVICE_BUS_PORT,
      transport: 'tcp',
      reconnect: false,
    });
    activeConnections.push(connection);
    connection.once('connection_open', () => resolve(connection));
    connection.once('connection_error', (context: EventContext) => reject(new Error(String(context.connection.error))));
    connection.once('disconnected', (context: EventContext) => {
      if (context.connection.error) reject(new Error(String(context.connection.error)));
    });
  });
}

async function receiveMessages(queue: string, limit: number, timeoutMs = 3000, hostname?: string): Promise<Array<Record<string, unknown>>> {
  const connection = await openConnection(hostname);
  const received: Array<Record<string, unknown>> = [];
  return new Promise((resolve) => {
    const receiver = connection.open_receiver({ source: { address: queue }, credit_window: 32 });
    const timer = setTimeout(() => {
      receiver.close();
      resolve(received);
    }, timeoutMs);

    receiver.on('message', (context: EventContext) => {
      if (!context.message) return;
      received.push({
        body: context.message.body,
        message_id: context.message.message_id,
        application_properties: context.message.application_properties,
      });
      if (received.length >= limit) {
        clearTimeout(timer);
        receiver.close();
        resolve(received);
      }
    });
  });
}

describe('Event Grid → Service Bus integration', () => {
  test('blob upload delivers event to a Service Bus queue via Event Grid subscription', async () => {
    const endpoint = getTestEndpoint();
    const rgName = `eg-sb-rg-${Date.now()}`;
    const queueName = `eg-sb-queue-${Date.now()}`;
    const subscriptionName = `eg-sb-sub-${Date.now()}`;
    const sbResourceId = `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${rgName}/providers/Microsoft.ServiceBus/namespaces/sbns/queues/${queueName}`;

    await fetch(
      `${endpoint}/azure/management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${rgName}?api-version=2022-09-01`,
      {
        method: 'PUT',
        headers: { Authorization: 'Bearer mockcloud-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: 'eastus' }),
      },
    );

    const subResponse = await fetch(
      `${endpoint}/azure/management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${rgName}/providers/Microsoft.EventGrid/eventSubscriptions/${subscriptionName}?api-version=2025-02-15`,
      {
        method: 'PUT',
        headers: { Authorization: 'Bearer mockcloud-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: {
            topic: `/providers/Microsoft.Storage/storageAccounts/${AZURE_STORAGE_ACCOUNT}`,
            destination: {
              endpointType: 'ServiceBusQueue',
              properties: { resourceId: sbResourceId },
            },
            filter: {
              includedEventTypes: ['Microsoft.Storage.BlobCreated'],
            },
          },
        }),
      },
    );
    expect(subResponse.status).toBe(201);

    const containerName = `egsb${Date.now()}`;
    const blobClient = createBlobServiceClient();
    const container = blobClient.getContainerClient(containerName);
    await container.create();
    const blob = container.getBlockBlobClient('test-event.txt');
    await blob.upload('hello from eventgrid', Buffer.byteLength('hello from eventgrid'), {
      blobHTTPHeaders: { blobContentType: 'text/plain' },
    });

    const received = await receiveMessages(queueName, 1, 3000, 'sbns.servicebus.windows.net');
    expect(received.length).toBe(1);
    const events = received[0].body as Array<Record<string, unknown>>;
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'Microsoft.Storage.BlobCreated',
          subject: `/blobServices/default/containers/${containerName}/blobs/test-event.txt`,
        }),
      ]),
    );
  });
});
