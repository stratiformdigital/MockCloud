import type { MockServiceDefinition, ParsedApiRequest, ApiResponse } from '../../types.js';
import { waitForDynamoLocal } from './local.js';
import { getBaseUrl } from '../../server-url.js';

function describeEndpoints(): ApiResponse {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/x-amz-json-1.0' },
    body: JSON.stringify({
      Endpoints: [{
        Address: new URL(getBaseUrl()).host,
        CachePeriodInMinutes: 1440,
      }],
    }),
  };
}

async function proxy(req: ParsedApiRequest): Promise<ApiResponse> {
  const port = await waitForDynamoLocal();
  const res = await fetch(`http://localhost:${port}`, {
    method: 'POST',
    headers: {
      'Content-Type': req.headers['content-type'] ?? 'application/x-amz-json-1.0',
      'X-Amz-Target': req.headers['x-amz-target'] ?? '',
      'Authorization': req.headers['authorization'] ?? '',
    },
    body: req.rawBody.toString(),
  });
  const body = await res.text();
  return {
    statusCode: res.status,
    headers: Object.fromEntries(
      [...res.headers.entries()].filter(([k]) => k === 'content-type'),
    ),
    body,
  };
}

export const dynamodbService: MockServiceDefinition = {
  name: 'dynamodb',
  hostPatterns: ['dynamodb.*.amazonaws.com'],
  protocol: 'json',
  targetPrefix: 'DynamoDB_20120810',
  signingName: 'dynamodb',
  handlers: {
    DescribeEndpoints: () => describeEndpoints(),
    _default: proxy,
  },
};
