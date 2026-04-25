import { describe, expect, test } from 'vitest';
import {
  AZURE_EVENT_GRID_TOPIC,
  AZURE_SUBSCRIPTION_ID,
  createEventGridPublisherClient,
  createResourceManagementClient,
} from './azure-client-factory.js';
import { getTestEndpoint } from './client-factory.js';

function eventGridEndpoint(topicName: string): string {
  return `${getTestEndpoint()}/azure/${topicName}.eastus-1.eventgrid.azure.net`;
}

describe('Azure Event Grid', () => {
  const arm = createResourceManagementClient();

  test('publishes Event Grid schema events', async () => {
    const subject = `/mockcloud/events/${Date.now()}`;
    const client = createEventGridPublisherClient();

    await client.send([
      {
        subject,
        eventType: 'MockCloud.Test',
        dataVersion: '1.0',
        data: { message: 'hello-event-grid' },
      },
    ]);

    const response = await fetch(`${eventGridEndpoint(AZURE_EVENT_GRID_TOPIC)}/api/events`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        topicName: AZURE_EVENT_GRID_TOPIC,
        subject,
        eventType: 'MockCloud.Test',
        data: { message: 'hello-event-grid' },
      }),
    ]));
  });

  test('ARM deployment provisions topics and event subscriptions', async () => {
    const resourceGroupName = `az-eventgrid-rg-${Date.now()}`;
    const deploymentName = `az-eventgrid-deployment-${Date.now()}`;
    const topicName = `azeg${Date.now()}`;
    const subscriptionName = 'functionTarget';

    await arm.resourceGroups.createOrUpdate(resourceGroupName, { location: 'eastus' });

    const response = await fetch(
      `${getTestEndpoint()}/azure/management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${resourceGroupName}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer mockcloud-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            mode: 'Incremental',
            template: {
              $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
              contentVersion: '1.0.0.0',
              languageVersion: '2.0',
              resources: {
                topic: {
                  type: 'Microsoft.EventGrid/topics',
                  apiVersion: '2025-02-15',
                  name: topicName,
                  location: '[resourceGroup().location]',
                  properties: {
                    inputSchema: 'EventGridSchema',
                  },
                },
                subscription: {
                  type: 'Microsoft.EventGrid/topics/eventSubscriptions',
                  apiVersion: '2025-02-15',
                  name: `[format('{0}/{1}', '${topicName}', '${subscriptionName}')]`,
                  dependsOn: ['topic'],
                  properties: {
                    destination: {
                      endpointType: 'WebHook',
                      properties: {
                        endpointUrl: 'https://example.invalid/eventgrid',
                      },
                    },
                    filter: {
                      includedEventTypes: ['MockCloud.Test'],
                    },
                    labels: ['mockcloud'],
                  },
                },
              },
              outputs: {
                topicResourceId: {
                  type: 'string',
                  value: `[resourceId('Microsoft.EventGrid/topics', '${topicName}')]`,
                },
                subscriptionResourceId: {
                  type: 'string',
                  value: `[resourceId('Microsoft.EventGrid/topics/eventSubscriptions', '${topicName}', '${subscriptionName}')]`,
                },
              },
            },
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    const deployment = await response.json();

    const topic = await arm.resources.getById(deployment.properties.outputs.topicResourceId.value, '2025-02-15');
    expect(topic.name).toBe(topicName);

    const subscription = await arm.resources.getById(deployment.properties.outputs.subscriptionResourceId.value, '2025-02-15');
    expect(subscription.name).toBe(`${topicName}/${subscriptionName}`);

    const subscriptions = await fetch(`${eventGridEndpoint(topicName)}/api/subscriptions`);
    expect(subscriptions.status).toBe(200);
    const body = await subscriptions.json();
    expect(body.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: subscriptionName,
        properties: expect.objectContaining({
          labels: ['mockcloud'],
        }),
      }),
    ]));

    await createEventGridPublisherClient(topicName).send([
      {
        subject: '/mockcloud/arm',
        eventType: 'MockCloud.Test',
        dataVersion: '1.0',
        data: { deployed: true },
      },
    ]);

    const events = await fetch(`${eventGridEndpoint(topicName)}/api/events`);
    const eventsBody = await events.json();
    expect(eventsBody.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        topicName,
        eventType: 'MockCloud.Test',
        data: { deployed: true },
      }),
    ]));
  });
});
