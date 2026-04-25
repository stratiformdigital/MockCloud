import { randomUUID } from 'node:crypto';
import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';
import { PersistentMap } from '../../../state/store.js';
import { EVENT_GRID_TOPIC, LOCATION, SUBSCRIPTION_ID } from '../../config.js';

interface EventGridTopic {
  id: string;
  name: string;
  location: string;
  endpoint: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
  created: string;
  updated: string;
}

interface EventGridSubscription {
  id: string;
  topicName: string;
  name: string;
  destination?: Record<string, unknown>;
  filter?: Record<string, unknown>;
  labels?: string[];
  properties?: Record<string, unknown>;
  created: string;
  updated: string;
}

interface PublishedEvent {
  id: string;
  topicName: string;
  schema: 'EventGrid' | 'CloudEvent' | 'Custom';
  subject?: string;
  eventType?: string;
  eventTime: string;
  data?: unknown;
  raw: Record<string, unknown>;
}

const topics = new PersistentMap<string, EventGridTopic>('azure-eventgrid-topics');
const subscriptions = new PersistentMap<string, EventGridSubscription>('azure-eventgrid-subscriptions');
const events = new PersistentMap<string, PublishedEvent[]>('azure-eventgrid-events');

function topicKey(name: string): string {
  return name.toLowerCase();
}

function subscriptionKey(topicName: string, name: string): string {
  return `${topicName.toLowerCase()}\0${name.toLowerCase()}`;
}

function topicNameFromHost(req: AzureParsedRequest): string {
  const match = req.azureHost.match(/^([^.]+)(?:\.[^.]+-\d+)?\.eventgrid\.azure\.net$/i);
  return match ? match[1] : EVENT_GRID_TOPIC;
}

function topicEndpoint(topicName: string): string {
  return `https://${topicName}.${LOCATION}-1.eventgrid.azure.net/api/events`;
}

function topicArmId(topicName: string): string {
  return `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/mockcloud/providers/Microsoft.EventGrid/topics/${topicName}`;
}

function pathParts(req: AzureParsedRequest): string[] {
  return req.azurePath.split('/').filter(Boolean).map(decodeURIComponent);
}

function jsonResponse(data: unknown, statusCode = 200): ApiResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(data),
  };
}

function emptyResponse(statusCode = 200): ApiResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: '',
  };
}

function eventGridError(code: string, message: string, statusCode: number): ApiResponse {
  return jsonResponse({ error: { code, message } }, statusCode);
}

function ensureTopic(topicName: string): EventGridTopic {
  const existing = topics.get(topicKey(topicName));
  if (existing) return existing;
  const now = new Date().toISOString();
  const topic: EventGridTopic = {
    id: topicArmId(topicName),
    name: topicName,
    location: LOCATION,
    endpoint: topicEndpoint(topicName),
    created: now,
    updated: now,
    properties: {
      provisioningState: 'Succeeded',
      inputSchema: 'EventGridSchema',
      endpoint: topicEndpoint(topicName),
    },
  };
  topics.set(topicKey(topicName), topic);
  return topic;
}

export function createEventGridTopicFromArm(input: {
  id: string;
  name: string;
  location?: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
}): void {
  const existing = topics.get(topicKey(input.name));
  const now = new Date().toISOString();
  const endpoint = typeof input.properties?.endpoint === 'string'
    ? input.properties.endpoint
    : topicEndpoint(input.name);
  topics.set(topicKey(input.name), {
    id: input.id,
    name: input.name,
    location: input.location ?? existing?.location ?? LOCATION,
    tags: input.tags ?? existing?.tags,
    endpoint,
    properties: {
      provisioningState: 'Succeeded',
      inputSchema: 'EventGridSchema',
      ...(existing?.properties ?? {}),
      ...(input.properties ?? {}),
      endpoint,
    },
    created: existing?.created ?? now,
    updated: now,
  });
}

export function deleteEventGridTopicFromArm(topicName: string): void {
  topics.delete(topicKey(topicName));
  events.delete(topicKey(topicName));
  for (const subscription of Array.from(subscriptions.values())) {
    if (subscription.topicName.toLowerCase() === topicName.toLowerCase()) {
      subscriptions.delete(subscriptionKey(subscription.topicName, subscription.name));
    }
  }
}

export function createEventGridSubscriptionFromArm(input: {
  id: string;
  topicName: string;
  name: string;
  destination?: Record<string, unknown>;
  filter?: Record<string, unknown>;
  labels?: string[];
  properties?: Record<string, unknown>;
}): void {
  ensureTopic(input.topicName);
  const existing = subscriptions.get(subscriptionKey(input.topicName, input.name));
  const now = new Date().toISOString();
  subscriptions.set(subscriptionKey(input.topicName, input.name), {
    id: input.id,
    topicName: input.topicName,
    name: input.name,
    destination: input.destination ?? existing?.destination,
    filter: input.filter ?? existing?.filter,
    labels: input.labels ?? existing?.labels,
    properties: {
      provisioningState: 'Succeeded',
      ...(existing?.properties ?? {}),
      ...(input.properties ?? {}),
    },
    created: existing?.created ?? now,
    updated: now,
  });
}

export function deleteEventGridSubscriptionFromArm(topicName: string, name: string): void {
  subscriptions.delete(subscriptionKey(topicName, name));
}

function eventSchema(raw: Record<string, unknown>, contentType: string): PublishedEvent['schema'] {
  if (contentType.includes('cloudevents') || raw.specversion) return 'CloudEvent';
  if (raw.eventType || raw.dataVersion) return 'EventGrid';
  return 'Custom';
}

function normalizeEvent(topicName: string, item: unknown, contentType: string): PublishedEvent {
  const raw = item && typeof item === 'object' && !Array.isArray(item)
    ? item as Record<string, unknown>
    : { data: item };
  const id = typeof raw.id === 'string' ? raw.id : randomUUID();
  const eventTime = raw.eventTime instanceof Date
    ? raw.eventTime.toISOString()
    : typeof raw.eventTime === 'string'
      ? raw.eventTime
      : typeof raw.time === 'string'
        ? raw.time
        : new Date().toISOString();
  const eventType = typeof raw.eventType === 'string'
    ? raw.eventType
    : typeof raw.type === 'string'
      ? raw.type
      : undefined;
  return {
    id,
    topicName,
    schema: eventSchema(raw, contentType),
    subject: typeof raw.subject === 'string' ? raw.subject : undefined,
    eventType,
    eventTime,
    data: raw.data,
    raw,
  };
}

function publishedEvents(topicName: string): PublishedEvent[] {
  return events.get(topicKey(topicName)) ?? [];
}

function publishEvents(req: AzureParsedRequest): ApiResponse {
  const topicName = topicNameFromHost(req);
  ensureTopic(topicName);
  const payload = req.body as unknown;
  const items = Array.isArray(payload) ? payload : [payload];
  const contentType = req.headers['content-type'] ?? '';
  const next = [
    ...publishedEvents(topicName),
    ...items.map((item) => normalizeEvent(topicName, item, contentType)),
  ];
  events.set(topicKey(topicName), next);
  return emptyResponse(200);
}

function listEvents(req: AzureParsedRequest): ApiResponse {
  return jsonResponse({ value: publishedEvents(topicNameFromHost(req)) });
}

function listSubscriptions(req: AzureParsedRequest): ApiResponse {
  const topicName = topicNameFromHost(req);
  const value = Array.from(subscriptions.values())
    .filter((subscription) => subscription.topicName.toLowerCase() === topicName.toLowerCase())
    .map((subscription) => ({
      id: subscription.id,
      name: subscription.name,
      type: 'Microsoft.EventGrid/topics/eventSubscriptions',
      properties: {
        destination: subscription.destination,
        filter: subscription.filter,
        labels: subscription.labels,
        provisioningState: subscription.properties?.provisioningState ?? 'Succeeded',
      },
    }));
  return jsonResponse({ value });
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  const [root, second] = pathParts(req);
  if (root === 'api' && second === 'events') {
    if (req.method === 'POST') return publishEvents(req);
    if (req.method === 'GET') return listEvents(req);
  }
  if (root === 'api' && second === 'subscriptions' && req.method === 'GET') {
    return listSubscriptions(req);
  }
  return eventGridError('BadRequest', 'The requested Event Grid operation is not supported by MockCloud.', 400);
}

export const azureEventGridService: AzureServiceDefinition = {
  name: 'azure-eventgrid',
  hostPatterns: ['*.eventgrid.azure.net', '*.*.eventgrid.azure.net'],
  handlers: {
    _default: routeRequest,
  },
};
