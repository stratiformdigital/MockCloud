import { randomUUID } from 'node:crypto';
import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';
import { PersistentMap } from '../../../state/store.js';

interface AnalyzeResult {
  resultId: string;
  modelId: string;
  urlSource?: string;
  content: string;
  createdAt: string;
}

const analyzeResults = new PersistentMap<string, AnalyzeResult>('azure-cognitive-analyze-results');

function pathParts(req: AzureParsedRequest): string[] {
  return req.azurePath.split('/').filter(Boolean).map(decodeURIComponent);
}

function jsonResponse(body: unknown, statusCode = 200, headers: Record<string, string> = {}): ApiResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify(body),
  };
}

function cognitiveError(code: string, message: string, statusCode = 400): ApiResponse {
  return jsonResponse({ error: { code, message } }, statusCode);
}

function proxyBaseUrl(req: AzureParsedRequest): string {
  const host = req.headers.host ?? 'localhost:4444';
  const proto = req.headers['x-forwarded-proto'] ?? (host.includes('4445') ? 'https' : 'http');
  return `${proto}://${host}`;
}

function synthesizeOcrText(urlSource: string | undefined, modelId: string): string {
  const source = urlSource ?? 'unknown-source';
  let resourceLabel = source;
  try {
    const parsed = new URL(source);
    resourceLabel = `${parsed.hostname}${parsed.pathname}`;
  } catch {
    /* non-URL source, use as-is */
  }
  return [
    `[MockCloud Document Intelligence OCR result]`,
    `Model: ${modelId}`,
    `Source: ${resourceLabel}`,
    `Contract Number: MOCK-CONTRACT-001`,
    `Vendor Name: MockCloud Vendor`,
    `UEI: ABCDEFGHIJKL`,
  ].join('\n');
}

function analyzeEnvelope(result: AnalyzeResult): Record<string, unknown> {
  return {
    status: 'succeeded',
    createdDateTime: result.createdAt,
    lastUpdatedDateTime: result.createdAt,
    analyzeResult: {
      apiVersion: '2024-07-31-preview',
      modelId: result.modelId,
      stringIndexType: 'textElements',
      content: result.content,
      pages: [
        {
          pageNumber: 1,
          angle: 0,
          width: 8.5,
          height: 11,
          unit: 'inch',
          spans: [{ offset: 0, length: result.content.length }],
          words: result.content.split(/\s+/).filter(Boolean).map((word, index) => ({
            content: word,
            polygon: [],
            confidence: 0.99,
            span: { offset: index, length: word.length },
          })),
          lines: result.content.split('\n').map((line, index) => ({
            content: line,
            polygon: [],
            spans: [{ offset: index, length: line.length }],
          })),
        },
      ],
      paragraphs: result.content.split('\n').map((line) => ({
        content: line,
        spans: [{ offset: 0, length: line.length }],
        boundingRegions: [],
      })),
      styles: [],
    },
  };
}

function startAnalyze(req: AzureParsedRequest, modelId: string): ApiResponse {
  const body = req.body as Record<string, unknown>;
  const urlSource = typeof body.urlSource === 'string' ? body.urlSource : undefined;
  const resultId = randomUUID();
  const result: AnalyzeResult = {
    resultId,
    modelId,
    urlSource,
    content: synthesizeOcrText(urlSource, modelId),
    createdAt: new Date().toISOString(),
  };
  analyzeResults.set(resultId, result);

  const operationLocation = `${proxyBaseUrl(req)}/documentintelligence/documentModels/${modelId}/analyzeResults/${resultId}?api-version=${req.apiVersion}`;
  return {
    statusCode: 202,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Operation-Location': operationLocation,
      'apim-request-id': resultId,
    },
    body: '',
  };
}

function getAnalyzeResult(resultId: string): ApiResponse {
  const result = analyzeResults.get(resultId);
  if (!result) return cognitiveError('ResultNotFound', `Analyze result '${resultId}' was not found.`, 404);
  return jsonResponse(analyzeEnvelope(result));
}

function getAnalyzePdf(resultId: string): ApiResponse {
  const result = analyzeResults.get(resultId);
  if (!result) return cognitiveError('ResultNotFound', `Analyze result '${resultId}' was not found.`, 404);
  const pdf = Buffer.from(`%PDF-1.4\n% MockCloud searchable PDF for ${result.resultId}\n${result.content}\n%%EOF`);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(pdf.length) },
    body: '',
    bodyBuffer: pdf,
  };
}

function analyzeLanguage(req: AzureParsedRequest): ApiResponse {
  const body = req.body as Record<string, unknown>;
  const kind = typeof body.kind === 'string' ? body.kind : '';
  const analysisInput = body.analysisInput as { documents?: Array<Record<string, unknown>> } | undefined;
  const document = analysisInput?.documents?.[0];
  const text = typeof document?.text === 'string' ? document.text : '';
  const id = typeof document?.id === 'string' ? document.id : '1';

  if (kind === 'KeyPhraseExtraction') {
    const phrases = extractKeyPhrases(text);
    return jsonResponse({
      kind,
      results: {
        documents: [{ id, keyPhrases: phrases, warnings: [] }],
        errors: [],
        modelVersion: '2023-04-01',
      },
    });
  }

  if (kind === 'EntityRecognition') {
    const entities = extractEntities(text);
    return jsonResponse({
      kind,
      results: {
        documents: [{ id, entities, warnings: [] }],
        errors: [],
        modelVersion: '2023-04-01',
      },
    });
  }

  return cognitiveError('UnsupportedKind', `Analyze kind '${kind}' is not supported by MockCloud.`, 400);
}

function extractKeyPhrases(text: string): string[] {
  const tokens = text
    .split(/\s+/)
    .map((t) => t.replace(/[^A-Za-z0-9-]/g, ''))
    .filter((t) => t.length >= 4);
  return Array.from(new Set(tokens)).slice(0, 5);
}

function extractEntities(text: string): Array<Record<string, unknown>> {
  const entities: Array<Record<string, unknown>> = [];
  for (const word of text.split(/\s+/)) {
    const trimmed = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (!trimmed) continue;
    if (/^[A-Z][a-z]+$/.test(trimmed)) {
      entities.push({
        text: trimmed,
        category: 'Person',
        offset: 0,
        length: trimmed.length,
        confidenceScore: 0.9,
      });
    } else if (/^\d+$/.test(trimmed)) {
      entities.push({
        text: trimmed,
        category: 'Quantity',
        offset: 0,
        length: trimmed.length,
        confidenceScore: 0.9,
      });
    }
  }
  return entities.slice(0, 20);
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  const parts = pathParts(req);

  if (parts[0] === 'language' && parts[1] === ':analyze-text' && req.method === 'POST') {
    return analyzeLanguage(req);
  }

  if (parts[0] === 'documentintelligence' || parts[0] === 'formrecognizer') {
    const rest = parts.slice(1);
    if (rest[0] === 'documentModels' && rest[1] && rest.length === 2) {
      const [modelId, action] = rest[1].split(':');
      if (action === 'analyze' && req.method === 'POST') {
        return startAnalyze(req, modelId);
      }
    }
    if (
      rest[0] === 'documentModels' &&
      rest[2] === 'analyzeResults' &&
      rest[3] &&
      req.method === 'GET'
    ) {
      if (rest[4] === 'pdf') return getAnalyzePdf(rest[3]);
      return getAnalyzeResult(rest[3]);
    }
  }

  return cognitiveError('NotFound', 'The requested Azure Cognitive Services operation is not supported by MockCloud.', 404);
}

export const azureCognitiveServicesService: AzureServiceDefinition = {
  name: 'azure-cognitive-services',
  hostPatterns: ['*.cognitiveservices.azure.com'],
  pathPatterns: ['/documentintelligence/**', '/formrecognizer/**', '/language/**'],
  handlers: {
    _default: routeRequest,
  },
};
