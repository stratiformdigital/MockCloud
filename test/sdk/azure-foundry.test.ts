import { describe, expect, test } from 'vitest';
import { getTestEndpoint } from './client-factory.js';

function foundryEndpoint(resource = 'mockfoundry'): string {
  return `${getTestEndpoint()}/azure/${resource}.services.ai.azure.com`;
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function askMessages(prompt: string): Promise<Record<string, any>> {
  return json<Record<string, any>>(
    await fetch(`${foundryEndpoint()}/anthropic/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'mockcloud',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-mock',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 256,
        temperature: 0,
        stream: false,
      }),
    }),
  );
}

describe('Azure Foundry Messages', () => {
  test('returns an Anthropic-shaped message envelope', async () => {
    const response = await askMessages('hello foundry');
    expect(response.type).toBe('message');
    expect(response.role).toBe('assistant');
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content[0].type).toBe('text');
    expect(response.stop_reason).toBe('end_turn');
  });

  test('classification prompts detect contract keyword', async () => {
    const response = await askMessages(
      `Classify the following text into one of four categories:\n- contract\n- w7\n- id\n- other\nOnly give a one-word response, using only lower case letters and numbers.\n\nThe text is as follows:\nContract Number FA873213D0006 Task Order 001 Federal Acquisition Regulation.`,
    );
    expect(response.content[0].text).toBe('contract');
  });

  test('classification prompts detect w7 keyword', async () => {
    const response = await askMessages(
      `Classify the following text into one of four categories:\n- contract\n- w7\n- id\n- other\nOnly give a one-word response, using only lower case letters and numbers.\n\nThe text is as follows:\nForm W-7 Application for IRS Individual Taxpayer Identification Number.`,
    );
    expect(response.content[0].text).toBe('w7');
  });

  test('extraction prompts return JSON object with contract fields', async () => {
    const response = await askMessages(
      'Extract the contract number, vendor name, UEI and CAGE code as JSON. Only respond with JSON. Contract Number: MOCK-1',
    );
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.contractNumber).toBeDefined();
  });
});
