import { randomUUID } from 'node:crypto';
import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';

function pathParts(req: AzureParsedRequest): string[] {
  return req.azurePath.split('/').filter(Boolean).map(decodeURIComponent);
}

function jsonResponse(body: unknown, statusCode = 200): ApiResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

function foundryError(code: string, message: string, statusCode = 400): ApiResponse {
  return jsonResponse({ type: 'error', error: { type: code, message } }, statusCode);
}

function flattenPromptContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const text = (part as Record<string, unknown>).text;
        return typeof text === 'string' ? text : '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function synthesizeAnswer(messages: Array<Record<string, unknown>>): string {
  const prompt = messages
    .map((m) => flattenPromptContent(m.content))
    .join('\n')
    .toLowerCase();

  if (prompt.includes('classify the following text')) {
    const body = prompt.split('the text is as follows:')[1] ?? prompt;
    if (/\b(contract\s+number|piid|task\s+order|award|federal\s+acquisition)\b/.test(body)) return 'contract';
    if (/\b(form\s*w-?7|itin|individual taxpayer identification)\b/.test(body)) return 'w7';
    if (/\b(passport|driver\'?s license|identification card)\b/.test(body)) return 'id';
    return 'other';
  }

  if (prompt.includes('contract number') || prompt.includes('piid')) {
    return JSON.stringify({
      contractNumber: 'MOCK-CONTRACT-001',
      vendorName: 'MockCloud Vendor',
      uei: 'ABCDEFGHIJKL',
      cageCode: '1A2B3',
    });
  }

  if (prompt.includes('extract') && prompt.includes('json')) {
    return '{}';
  }

  return 'other';
}

function messagesResponse(req: AzureParsedRequest): ApiResponse {
  const body = req.body as Record<string, unknown>;
  const messages = Array.isArray(body.messages) ? (body.messages as Array<Record<string, unknown>>) : [];
  const model = typeof body.model === 'string' ? body.model : 'claude-sonnet-mock';
  const answer = synthesizeAnswer(messages);
  const id = `msg_${randomUUID()}`;
  return jsonResponse({
    id,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text: answer }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: Math.max(1, Math.floor(JSON.stringify(messages).length / 4)),
      output_tokens: Math.max(1, Math.floor(answer.length / 4)),
    },
  });
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  const parts = pathParts(req);

  if (
    parts.length >= 3 &&
    parts[0].toLowerCase() === 'anthropic' &&
    parts[1].toLowerCase() === 'v1' &&
    parts[2].toLowerCase() === 'messages' &&
    req.method === 'POST'
  ) {
    return messagesResponse(req);
  }

  if (parts.length === 2 && parts[0].toLowerCase() === 'v1' && parts[1].toLowerCase() === 'messages' && req.method === 'POST') {
    return messagesResponse(req);
  }

  return foundryError('not_found', 'The requested Azure Foundry operation is not supported by MockCloud.', 404);
}

export const azureFoundryService: AzureServiceDefinition = {
  name: 'azure-foundry',
  hostPatterns: ['*.services.ai.azure.com', '*.openai.azure.com'],
  handlers: {
    _default: routeRequest,
  },
};
