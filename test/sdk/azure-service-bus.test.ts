import { afterEach, describe, expect, test } from 'vitest';
import rhea from 'rhea';
import type { Connection, EventContext } from 'rhea';

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

function openConnection(): Promise<Connection> {
  const container = create_container({ container_id: `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}` });
  return new Promise((resolve, reject) => {
    const connection = container.connect({
      host: 'localhost',
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

async function sendMessage(queue: string, body: unknown, applicationProperties?: Record<string, unknown>): Promise<void> {
  const connection = await openConnection();
  await new Promise<void>((resolve, reject) => {
    const sender = connection.open_sender({ target: { address: queue } });
    sender.once('sendable', () => {
      sender.send({ body, application_properties: applicationProperties });
      sender.once('settled', () => resolve());
      setTimeout(resolve, 200);
    });
    sender.once('sender_error', (context: EventContext) => reject(new Error(String(context.sender?.error))));
  });
}

async function receiveMessages(queue: string, limit: number, timeoutMs = 2000): Promise<Array<Record<string, unknown>>> {
  const connection = await openConnection();
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

describe('Azure Service Bus AMQP', () => {
  test('send and receive a single message on a named queue', async () => {
    const queue = `queue-${Date.now()}`;
    await sendMessage(queue, 'hello amqp', { source: 'test' });
    const received = await receiveMessages(queue, 1);
    expect(received.length).toBe(1);
    expect(received[0].body).toBe('hello amqp');
    expect((received[0].application_properties as Record<string, unknown>)?.source).toBe('test');
  });

  test('fan-out: multiple senders can enqueue before a receiver connects', async () => {
    const queue = `queue-${Date.now()}`;
    await sendMessage(queue, 'one');
    await sendMessage(queue, 'two');
    await sendMessage(queue, 'three');

    const received = await receiveMessages(queue, 3);
    const bodies = received.map((m) => m.body).sort();
    expect(bodies).toEqual(['one', 'three', 'two']);
  });

  test('queue isolation: messages in different queues do not mix', async () => {
    const queueA = `queue-a-${Date.now()}`;
    const queueB = `queue-b-${Date.now()}`;

    await sendMessage(queueA, 'alpha');
    await sendMessage(queueB, 'beta');

    const fromA = await receiveMessages(queueA, 1);
    const fromB = await receiveMessages(queueB, 1);

    expect(fromA[0].body).toBe('alpha');
    expect(fromB[0].body).toBe('beta');
  });
});
