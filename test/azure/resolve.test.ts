import { describe, expect, test } from 'vitest';
import { createAzureResolver } from '../../src/azure/resolve.js';
import { azureCognitiveServicesService } from '../../src/azure/services/cognitive-services/index.js';
import type { AzureParsedRequest } from '../../src/types.js';

function makeRequest(overrides: Partial<AzureParsedRequest> = {}): AzureParsedRequest {
  return {
    action: '',
    body: {},
    rawBody: Buffer.alloc(0),
    headers: {},
    queryParams: {},
    path: '/language/:analyze-text',
    method: 'POST',
    apiVersion: '2023-04-01',
    azureHost: 'localhost',
    azurePath: '/language/:analyze-text',
    ...overrides,
  };
}

describe('Azure resolver', () => {
  test('falls back to path pattern matching for direct cognitive-services prefixes', () => {
    const resolveAzure = createAzureResolver([azureCognitiveServicesService]);

    const service = resolveAzure(makeRequest());

    expect(service?.name).toBe('azure-cognitive-services');
  });
});
