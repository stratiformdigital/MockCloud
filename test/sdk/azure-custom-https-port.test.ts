import { describe, expect, test } from 'vitest';
import type { AzureParsedRequest } from '../../src/types.js';
import { azureAuthService } from '../../src/azure/services/auth/index.js';
import { provisionArmTemplate } from '../../src/azure/services/arm/template.js';
import { azureCognitiveServicesService } from '../../src/azure/services/cognitive-services/index.js';
import { azureCosmosService } from '../../src/azure/services/cosmos/index.js';
import { azureFunctionsService } from '../../src/azure/services/functions/index.js';

function makeRequest(overrides: Partial<AzureParsedRequest> = {}): AzureParsedRequest {
  return {
    action: '',
    body: {},
    rawBody: Buffer.alloc(0),
    headers: {},
    queryParams: {},
    path: '/',
    method: 'GET',
    apiVersion: '2024-01-01',
    azureHost: 'management.azure.com',
    azurePath: '/',
    azureHttpsPort: 5557,
    ...overrides,
  };
}

describe('Azure configurable HTTPS port', () => {
  test('ARM template environment and Application Insights reference use the configured HTTPS port', () => {
    const result = provisionArmTemplate({
      deploymentName: 'custom-port-deployment',
      azureHttpsPort: 5557,
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.Insights/components',
            apiVersion: '2020-02-02',
            name: 'custom-port-insights',
            location: 'eastus',
            properties: {},
          },
        ],
        outputs: {
          loginEndpoint: {
            type: 'string',
            value: "[environment().authentication.loginEndpoint]",
          },
          appInsightsConnectionString: {
            type: 'string',
            value: "[reference(resourceId('Microsoft.Insights/components', 'custom-port-insights')).ConnectionString]",
          },
        },
      },
    });

    expect(result.outputs.loginEndpoint.value).toBe('https://localhost:5557/azure/login.microsoftonline.com/');
    expect(result.outputs.appInsightsConnectionString.value).toContain(
      'IngestionEndpoint=https://localhost:5557/azure/monitor.azure.com/',
    );
  });

  test('Cosmos DB endpoint synthesis infers HTTPS from the configured Azure HTTPS port', async () => {
    const response = await azureCosmosService.handlers._default!(makeRequest({
      headers: { host: 'localhost:5557' },
      path: '/azure/mockcosmos.documents.azure.com',
      azureHost: 'mockcosmos.documents.azure.com',
    }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      writableLocations: Array<{ databaseAccountEndpoint: string }>;
    };
    expect(body.writableLocations[0].databaseAccountEndpoint).toBe(
      'https://localhost:5557/azure/mockcosmos.documents.azure.com',
    );
  });

  test('Cognitive Services operation-location uses the configured Azure HTTPS port', async () => {
    const response = await azureCognitiveServicesService.handlers._default!(makeRequest({
      method: 'POST',
      headers: { host: 'localhost:5557', 'content-type': 'application/json' },
      body: { urlSource: 'http://localhost:4444/doc.pdf' },
      azureHost: 'mockcognitive.cognitiveservices.azure.com',
      azurePath: '/documentintelligence/documentModels/prebuilt-read:analyze',
      apiVersion: '2024-07-31-preview',
    }));

    expect(response.statusCode).toBe(202);
    expect(response.headers?.['Operation-Location']).toMatch(
      /^https:\/\/localhost:5557\/documentintelligence\/documentModels\/prebuilt-read\/analyzeResults\/.+\?api-version=2024-07-31-preview$/,
    );
  });

  test('Functions metadata uses the configured Azure HTTPS port for invoke_url_template', async () => {
    const createResponse = await azureFunctionsService.handlers._default!(makeRequest({
      method: 'PUT',
      headers: { host: 'localhost:5557', 'content-type': 'application/json' },
      azureHost: 'customfunc.azurewebsites.net',
      azurePath: '/admin/functions/hello',
      body: {
        properties: {
          config: {
            bindings: [
              { authLevel: 'anonymous', type: 'httpTrigger', direction: 'in', name: 'req', methods: ['get'] },
              { type: 'http', direction: 'out', name: 'res' },
            ],
          },
        },
      },
    }));

    expect(createResponse.statusCode).toBe(200);
    const body = JSON.parse(createResponse.body) as { properties: { invoke_url_template: string } };
    expect(body.properties.invoke_url_template).toBe(
      'https://localhost:5557/azure/customfunc.azurewebsites.net/api/hello',
    );
  });

  test('Azure auth discovery aliases include the configured Azure HTTPS port', async () => {
    const response = await azureAuthService.handlers._default!(makeRequest({
      headers: { host: 'localhost:5557' },
      azureHost: 'login.microsoftonline.com',
      azurePath: '/discovery/instance',
      queryParams: { 'api-version': '1.1' },
    }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { metadata: Array<{ aliases: string[] }> };
    expect(body.metadata[0].aliases).toContain('localhost:5557');
  });
});
