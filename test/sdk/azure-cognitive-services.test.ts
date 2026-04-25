import { describe, expect, test } from 'vitest';
import { getTestEndpoint } from './client-factory.js';

const docIntelApi = '2024-07-31-preview';
const languageApi = '2023-04-01';

function cognitiveEndpoint(resource = 'mockcognitive'): string {
  return `${getTestEndpoint()}/azure/${resource}.cognitiveservices.azure.com`;
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

describe('Azure Cognitive Services', () => {
  test('Document Intelligence analyze returns 202 and poll succeeds', async () => {
    const endpoint = cognitiveEndpoint();
    const start = await fetch(
      `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=${docIntelApi}&output=pdf`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlSource: 'http://localhost:4444/blob.pdf' }),
      },
    );
    expect(start.status).toBe(202);
    const operationLocation = start.headers.get('operation-location');
    expect(operationLocation).toBeTruthy();

    const poll = await json<Record<string, any>>(await fetch(operationLocation as string));
    expect(poll.status).toBe('succeeded');
    expect(poll.analyzeResult.content).toContain('Contract Number');
    expect(Array.isArray(poll.analyzeResult.pages)).toBe(true);
  });

  test('Document Intelligence returns a searchable PDF blob', async () => {
    const endpoint = cognitiveEndpoint();
    const start = await fetch(
      `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=${docIntelApi}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlSource: 'http://localhost:4444/doc.pdf' }),
      },
    );
    const operationLocation = start.headers.get('operation-location') as string;
    const resultId = operationLocation.split('/').slice(-1)[0].split('?')[0];

    const pdfResponse = await fetch(
      `${endpoint}/documentintelligence/documentModels/prebuilt-read/analyzeResults/${resultId}/pdf?api-version=${docIntelApi}`,
    );
    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers.get('content-type')).toBe('application/pdf');
    const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
    expect(pdfBytes.slice(0, 5).toString()).toBe('%PDF-');
  });

  test('Language :analyze-text returns key phrases', async () => {
    const endpoint = cognitiveEndpoint();
    const response = await json<Record<string, any>>(
      await fetch(`${endpoint}/language/:analyze-text?api-version=${languageApi}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'KeyPhraseExtraction',
          parameters: { modelVersion: 'latest' },
          analysisInput: {
            documents: [{ id: '1', language: 'en', text: 'government contract modification number mockvendor' }],
          },
        }),
      }),
    );
    expect(response.results.documents[0].id).toBe('1');
    expect(Array.isArray(response.results.documents[0].keyPhrases)).toBe(true);
  });

  test('Language :analyze-text returns entities', async () => {
    const endpoint = cognitiveEndpoint();
    const response = await json<Record<string, any>>(
      await fetch(`${endpoint}/language/:analyze-text?api-version=${languageApi}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'EntityRecognition',
          parameters: { modelVersion: 'latest' },
          analysisInput: {
            documents: [{ id: '1', language: 'en', text: 'Peraton signed contract 42' }],
          },
        }),
      }),
    );
    expect(response.results.documents[0].id).toBe('1');
    expect(Array.isArray(response.results.documents[0].entities)).toBe(true);
    expect(response.results.documents[0].entities.length).toBeGreaterThan(0);
  });
});
