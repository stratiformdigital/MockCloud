import { randomUUID } from 'node:crypto';
import rhea from 'rhea';
import type { Container, EventContext, Sender, Message } from 'rhea';
import { info } from '../../../util/logger.js';

const { create_container } = rhea;

type QueueMessage = {
  id: string;
  body: unknown;
  properties?: Record<string, unknown>;
  applicationProperties?: Record<string, unknown>;
  enqueuedAt: number;
};

type QueueState = {
  messages: QueueMessage[];
  subscribers: Set<Sender>;
};

const queues = new Map<string, QueueState>();
const subscriberAddresses = new WeakMap<Sender, string>();
const cbsReplyLinks = new Map<unknown, Sender>();

function getOrCreateQueue(address: string): QueueState {
  let queue = queues.get(address);
  if (!queue) {
    queue = { messages: [], subscribers: new Set() };
    queues.set(address, queue);
  }
  return queue;
}

function deliverIfPossible(address: string): void {
  const queue = queues.get(address);
  if (!queue) return;
  while (queue.messages.length > 0) {
    const subscriber = Array.from(queue.subscribers).find(
      (sender) => sender.is_open() && sender.sendable(),
    );
    if (!subscriber) return;

    const queueMessage = queue.messages.shift();
    if (!queueMessage) return;

    const rheaMessage: Message = {
      message_id: queueMessage.id,
      body: queueMessage.body,
      application_properties: queueMessage.applicationProperties ?? {},
      message_annotations: {
        'x-opt-enqueued-time': new Date(queueMessage.enqueuedAt),
        'x-opt-sequence-number': queueMessage.enqueuedAt,
      },
    };
    try {
      subscriber.send(rheaMessage);
    } catch (err) {
      info(`Service Bus broker send failed: ${err instanceof Error ? err.message : String(err)}`);
      queue.messages.unshift(queueMessage);
      return;
    }
  }
}

function isCbsAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  return address === '$cbs' || address.startsWith('$cbs');
}

function resolveSourceAddress(sender: Sender): string | null {
  const source = sender.source as Record<string, unknown> | undefined;
  return typeof source?.address === 'string' ? (source.address as string) : null;
}

function resolveTargetAddress(context: EventContext): string | null {
  const receiver = context.receiver;
  if (!receiver) return null;
  const target = receiver.target as Record<string, unknown> | undefined;
  return typeof target?.address === 'string' ? (target.address as string) : null;
}

function handleCbsMessage(context: EventContext): void {
  const connection = context.connection;
  if (!connection) return;
  const correlationId = context.message?.correlation_id ?? context.message?.message_id ?? randomUUID();
  const replyLink = cbsReplyLinks.get(connection);
  // eslint-disable-next-line no-console
  console.log(`[servicebus] CBS request: op=${(context.message?.application_properties as Record<string, unknown> | undefined)?.operation} corrId=${correlationId} haveLink=${!!replyLink} sendable=${replyLink?.sendable()}`);
  const response: Message = {
    correlation_id: correlationId,
    application_properties: {
      'status-code': 200,
      'status-description': 'OK',
    },
  };
  if (replyLink && replyLink.is_open()) {
    if (replyLink.sendable()) {
      replyLink.send(response);
    } else {
      replyLink.once('sendable', () => replyLink.send(response));
    }
    return;
  }
  const replyTo = (context.message?.reply_to ?? '').toString() || '$cbs';
  const responseSender = connection.open_sender({ target: { address: replyTo } });
  responseSender.once('sendable', () => {
    responseSender.send(response);
  });
}

export function createServiceBusBroker(): Container {
  const container = create_container({ container_id: 'mockcloud-servicebus' });

  container.on('disconnected', () => {});

  container.on('sender_open', (context: EventContext) => {
    const sender = context.sender;
    if (!sender) return;
    const address = resolveSourceAddress(sender);
    // eslint-disable-next-line no-console
    console.log(`[servicebus] sender_open address=${address ?? '<none>'}`);
    if (isCbsAddress(address)) {
      if (context.connection) cbsReplyLinks.set(context.connection, sender);
      return;
    }
    if (!address) return;
    const queue = getOrCreateQueue(address);
    queue.subscribers.add(sender);
    subscriberAddresses.set(sender, address);
    info(`[servicebus] subscriber attached to ${address} (queued=${queue.messages.length})`);
    deliverIfPossible(address);
  });

  container.on('receiver_open', (context: EventContext) => {
    const receiver = context.receiver;
    if (!receiver) return;
    const address = resolveTargetAddress(context);
    // eslint-disable-next-line no-console
    console.log(`[servicebus] receiver_open address=${address ?? '<none>'}`);
    if (isCbsAddress(address)) return;
    receiver.add_credit(128);
  });

  container.on('sender_close', (context: EventContext) => {
    const sender = context.sender;
    if (!sender) return;
    const address = subscriberAddresses.get(sender);
    if (!address) return;
    const queue = queues.get(address);
    if (queue) queue.subscribers.delete(sender);
    subscriberAddresses.delete(sender);
  });

  container.on('sendable', (context: EventContext) => {
    const sender = context.sender;
    if (!sender) return;
    const address = resolveSourceAddress(sender);
    if (!address || isCbsAddress(address)) return;
    deliverIfPossible(address);
  });


  container.on('message', (context: EventContext) => {
    const targetAddress = resolveTargetAddress(context);
    if (isCbsAddress(targetAddress)) {
      handleCbsMessage(context);
      context.delivery?.accept();
      return;
    }
    if (!targetAddress) {
      context.delivery?.reject({ condition: 'amqp:internal-error', description: 'Missing target address' });
      return;
    }
    const message = context.message;
    if (!message) {
      context.delivery?.reject({ condition: 'amqp:internal-error', description: 'Missing message' });
      return;
    }
    const queueMessage: QueueMessage = {
      id: String(message.message_id ?? randomUUID()),
      body: message.body,
      properties: message.properties as Record<string, unknown> | undefined,
      applicationProperties: message.application_properties as Record<string, unknown> | undefined,
      enqueuedAt: Date.now(),
    };
    const queue = getOrCreateQueue(targetAddress);
    queue.messages.push(queueMessage);
    context.delivery?.accept();
    deliverIfPossible(targetAddress);
  });

  container.sasl_server_mechanisms.enable_anonymous();
  container.sasl_server_mechanisms.enable_plain(() => true);
  (container.sasl_server_mechanisms as Record<string, unknown>).MSSBCBS = () => ({
    outcome: true as boolean | undefined,
    username: 'mockcloud' as string | undefined,
    start: (_response?: Buffer) => {},
    step: (_response?: Buffer) => {},
  });
  (container.sasl_server_mechanisms as Record<string, unknown>)['MSSBCBS:TOKEN'] = () => ({
    outcome: true as boolean | undefined,
    username: 'mockcloud' as string | undefined,
    start: (_response?: Buffer) => {},
    step: (_response?: Buffer) => {},
  });

  return container;
}

export function getBrokerQueueSnapshot(): Record<string, number> {
  const snapshot: Record<string, number> = {};
  for (const [address, state] of queues.entries()) {
    snapshot[address] = state.messages.length;
  }
  return snapshot;
}

export function enqueueForTest(address: string, body: unknown): void {
  const queue = getOrCreateQueue(address);
  queue.messages.push({
    id: randomUUID(),
    body,
    enqueuedAt: Date.now(),
  });
  deliverIfPossible(address);
}

export function clearBrokerQueues(): void {
  queues.clear();
}
