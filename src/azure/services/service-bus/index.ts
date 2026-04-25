import type { Container } from 'rhea';
import { createServiceBusBroker } from './broker.js';
import { info } from '../../../util/logger.js';

let broker: Container | undefined;
let listener: ReturnType<Container['listen']> | undefined;

export function startServiceBusBroker(port: number): void {
  if (broker) return;
  broker = createServiceBusBroker();
  listener = broker.listen({ port });
  info(`Azure Service Bus AMQP listener on amqp://localhost:${port}`);
}

export function stopServiceBusBroker(): void {
  if (!broker) return;
  try {
    listener?.close();
  } catch {
    /* ignore */
  }
  broker = undefined;
  listener = undefined;
}

export { getBrokerQueueSnapshot, enqueueForTest, clearBrokerQueues } from './broker.js';
