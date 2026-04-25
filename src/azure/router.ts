import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AzureServiceDefinition, AzureParsedRequest } from '../types.js';
import { applyAzureHeaders } from './middleware.js';
import { parseAzureRequest } from './request-parser.js';
import { createAzureResolver, isAzureHost } from './resolve.js';
import { getAllAzureServices } from './registry.js';
import { azureError } from './response.js';
import { debug, info } from '../util/logger.js';

const services = getAllAzureServices();
const resolveAzure = createAzureResolver(services);

function embeddedProxyHost(pathname: string): string | null {
  const match = pathname.match(/^\/(?:azure|api)\/([^/]+)/);
  return match ? match[1] : null;
}

const AZURE_PATH_PREFIXES = [
  '/documentintelligence/',
  '/formrecognizer/',
  '/language/',
];

export function isAzureRequest(req: IncomingMessage, url: URL, hostHeader: string): boolean {
  if (url.pathname.startsWith('/azure/')) return true;
  if (AZURE_PATH_PREFIXES.some((prefix) => url.pathname.toLowerCase().startsWith(prefix))) return true;

  const proxyHost = embeddedProxyHost(url.pathname);
  if (proxyHost && isAzureHost(proxyHost)) return true;
  if (isAzureHost(hostHeader)) return true;

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  return authHeader.startsWith('Bearer ') && url.searchParams.has('api-version');
}

async function dispatchHandler(
  service: AzureServiceDefinition,
  parsed: AzureParsedRequest,
  res: ServerResponse,
): Promise<void> {
  const handler = service.handlers._default;
  if (!handler) {
    info(`${service.name}.${parsed.azurePath} -> no handler`);
    const response = azureError('NotImplemented', 'The requested Azure operation is not implemented.');
    res.writeHead(response.statusCode, response.headers);
    res.end(response.body);
    return;
  }

  debug(`${service.name}.${parsed.method} ${parsed.azurePath} -> handler`);
  const response = await handler(parsed);
  if (response.headers) {
    for (const [key, value] of Object.entries(response.headers)) {
      res.setHeader(key, value);
    }
  }
  res.writeHead(response.statusCode, {
    'Content-Type': response.headers?.['Content-Type'] ?? 'application/json; charset=utf-8',
  });
  res.end(response.bodyBuffer ?? response.body);
}

export async function handleAzureRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  applyAzureHeaders(res);
  const parsed = await parseAzureRequest(req);
  const service = resolveAzure(parsed);

  if (!service) {
    info(`Unhandled Azure request: ${req.method} ${parsed.azureHost}${parsed.azurePath}`);
    const response = azureError('ResourceNotFound', 'The requested Azure resource was not found.', 404);
    res.writeHead(response.statusCode, response.headers);
    res.end(response.body);
    return;
  }

  await dispatchHandler(service, parsed, res);
}
