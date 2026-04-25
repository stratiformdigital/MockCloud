import type { ServerResponse } from 'node:http';
import { generateRequestId } from '../util/request-id.js';

export function applyAzureHeaders(res: ServerResponse): void {
  const requestId = generateRequestId();
  res.setHeader('x-ms-request-id', requestId);
  res.setHeader('x-ms-correlation-request-id', requestId);
  res.setHeader('x-ms-version', '2023-11-03');
  res.setHeader('Date', new Date().toUTCString());
}
