import type { IncomingMessage } from 'node:http';
import type { AzureParsedRequest } from '../types.js';
import { normalizeAzureHost } from './resolve.js';

function readBodyBuffer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[key] = value;
    } else if (Array.isArray(value)) {
      headers[key] = value.join(', ');
    }
  }
  return headers;
}

function extractHostAndPath(url: URL, headers: Record<string, string>): { azureHost: string; azurePath: string } {
  const proxyMatch = url.pathname.match(/^\/(?:azure|api)\/([^/]+)(\/.*)?$/);
  if (proxyMatch) {
    return {
      azureHost: proxyMatch[1],
      azurePath: proxyMatch[2] || '/',
    };
  }

  const hostHeader = (headers[':authority'] ?? headers.host ?? '').split(':')[0];
  return {
    azureHost: normalizeAzureHost(hostHeader),
    azurePath: url.pathname || '/',
  };
}

function extractArmSegments(pathname: string): Pick<AzureParsedRequest, 'subscriptionId' | 'resourceGroup' | 'provider'> {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const result: Pick<AzureParsedRequest, 'subscriptionId' | 'resourceGroup' | 'provider'> = {};
  for (let i = 0; i < parts.length; i++) {
    const current = parts[i].toLowerCase();
    if (current === 'subscriptions' && parts[i + 1]) {
      result.subscriptionId = parts[i + 1];
    }
    if (current === 'resourcegroups' && parts[i + 1]) {
      result.resourceGroup = parts[i + 1];
    }
    if (current === 'providers' && parts[i + 1]) {
      result.provider = parts[i + 1];
    }
  }
  return result;
}

export async function parseAzureRequest(req: IncomingMessage, azureHttpsPort?: number): Promise<AzureParsedRequest> {
  const rawBody = await readBodyBuffer(req);
  const rawBodyStr = rawBody.toString('utf-8');
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const queryParams: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    queryParams[key] = value;
  }

  const headers = parseHeaders(req);
  const { azureHost, azurePath } = extractHostAndPath(url, headers);
  const contentType = headers['content-type'] ?? '';
  let body: Record<string, unknown> = {};

  if (rawBodyStr && (contentType.includes('json') || rawBodyStr.trimStart().startsWith('{'))) {
    try {
      body = JSON.parse(rawBodyStr);
    } catch {
      try {
        body = JSON.parse(rawBodyStr.replace(/,\s*template\s*:/, ', "template":'));
      } catch {
        body = {};
      }
    }
  }

  return {
    action: '',
    body,
    rawBody,
    headers,
    queryParams,
    path: url.pathname,
    method: req.method ?? 'GET',
    apiVersion: queryParams['api-version'] ?? '',
    azureHost,
    azurePath,
    azureHttpsPort,
    ...extractArmSegments(azurePath),
  };
}
