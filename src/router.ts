import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerConfig, Middleware, ParsedApiRequest, MockServiceDefinition } from './types.js';
import { applyCors } from './middleware/cors.js';
import { applyAwsHeaders } from './middleware/aws-headers.js';
import { parseApiRequest } from './middleware/request-parser.js';
import { createResolver } from './services/resolve.js';
import { getAllMockServices } from './services/registry.js';
import { debug, info } from './util/logger.js';
import { handleApiGatewayRequest } from './services/apigateway/request-handler.js';
import { cfnResponses } from './services/cloudformation/engine/providers/custom-resource.js';
import { handleAzureRequest, isAzureRequest } from './azure/router.js';


function extractSigningService(authHeader: string): string | null {
  const match = authHeader.match(/Credential=[^/]+\/[^/]+\/[^/]+\/([^/]+)\//);
  return match ? match[1] : null;
}

function buildSigningNameLookup(services: MockServiceDefinition[]): Map<string, MockServiceDefinition> {
  const map = new Map<string, MockServiceDefinition>();
  for (const service of services) {
    if (service.signingName) {
      map.set(service.signingName, service);
    }
  }
  return map;
}

function emptyResponseForProtocol(protocol: string): string {
  if (protocol === 'query' || protocol === 'rest-xml') {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<Response><RequestId>00000000-0000-0000-0000-000000000000</RequestId></Response>';
  }
  return '{}';
}

function contentTypeForProtocol(protocol: string): string {
  if (protocol === 'query' || protocol === 'rest-xml') {
    return 'application/xml';
  }
  return 'application/json';
}

export function createRouter(
  config: ServerConfig,
  middlewares: Middleware[] = [],
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const services = getAllMockServices();
  const resolve = createResolver(services);
  const signingLookup = buildSigningNameLookup(services);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = url.pathname;
    debug(`${req.method} ${pathname}`);

    applyCors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/health') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname.startsWith('/cfn-response/')) {
      const key = pathname.split('/')[2];
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        if (key) cfnResponses.set(key, body);
      } catch (err) {
        info(`Failed to parse cfn-response body for key ${key}: ${err instanceof Error ? err.message : err}`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }

    const hostHeader = ((req.headers[':authority'] as string) ?? req.headers.host ?? '').split(':')[0];
    if (isAzureRequest(req, url, hostHeader)) {
      await handleAzureRequest(req, res);
      return;
    }

    if (hostHeader.includes('.execute-api.')) {
      await handleApiGatewayRequest(req, res);
      return;
    }
    if (
      hostHeader.endsWith('.amazonaws.com') ||
      hostHeader.endsWith('.amazoncognito.com') ||
      hostHeader.endsWith('.localhost')
    ) {
      req.url = `/api/${hostHeader}${pathname}${url.search || ''}`;
      await handleApiRequest(req, res, `/api/${hostHeader}${pathname}`, resolve);
      return;
    }

    const isApiProxyPath = pathname.startsWith('/api/');
    const authHeader = typeof req.headers['authorization'] === 'string' ? req.headers['authorization'] : '';
    if (!isApiProxyPath && authHeader.startsWith('AWS4-HMAC-SHA256 ')) {
      await handleCliRequest(req, res, authHeader, signingLookup);
      return;
    }

    const amzTarget = req.headers['x-amz-target'];
    if (!isApiProxyPath && typeof amzTarget === 'string' && amzTarget.includes('.')) {
      await handleApiRequest(req, res, pathname, resolve);
      return;
    }

    for (const mw of middlewares) {
      let called = false;
      await mw(req, res, async () => { called = true; });
      if (!called) return;
    }

    if (isApiProxyPath) {
      const apiHostMatch = pathname.match(/^\/api\/([^/]+)(\/.*)?$/);
      if (apiHostMatch) {
        const apiHost = apiHostMatch[1];

        if (apiHost.includes('.execute-api.')) {
          const remainingPath = apiHostMatch[2] ?? '/';
          req.url = remainingPath + (url.search || '');
          req.headers[':authority'] = apiHost;
          req.headers.host = apiHost;
          await handleApiGatewayRequest(req, res);
          return;
        }
      }
      await handleApiRequest(req, res, pathname, resolve);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  };
}

async function dispatchHandler(
  service: MockServiceDefinition,
  action: string,
  parsed: ParsedApiRequest,
  res: ServerResponse,
): Promise<void> {
  const handler = action
    ? (service.handlers[action] ?? service.handlers['_default'])
    : service.handlers['_default'];
  if (handler) {
    if (action && service.handlers[action]) {
      debug(`${service.name}.${action} → handler`);
    }
    const response = await handler(parsed);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.writeHead(response.statusCode, {
      'Content-Type': response.headers?.['Content-Type'] ?? contentTypeForProtocol(service.protocol),
    });
    res.end(response.bodyBuffer ?? response.body);
  } else {
    info(`${service.name}.${action || parsed.path} → no handler, returning empty response`);
    res.writeHead(200, { 'Content-Type': contentTypeForProtocol(service.protocol) });
    res.end(emptyResponseForProtocol(service.protocol));
  }
}

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  resolve: ReturnType<typeof createResolver>,
): Promise<void> {
  applyAwsHeaders(res);

  const parsed = await parseApiRequest(req);
  const match = resolve(pathname, parsed);

  if (!match) {
    info(`Unhandled: ${req.method} ${pathname} action=${parsed.action} target=${req.headers['x-amz-target'] ?? 'none'}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
    return;
  }

  await dispatchHandler(match.service, match.action, parsed, res);
}

async function handleCliRequest(
  req: IncomingMessage,
  res: ServerResponse,
  authHeader: string,
  signingLookup: Map<string, MockServiceDefinition>,
): Promise<void> {
  applyAwsHeaders(res);

  const signingName = extractSigningService(authHeader);
  if (!signingName) {
    debug(`CLI request with unparseable Authorization header`);
    res.writeHead(400, { 'Content-Type': 'application/xml' });
    res.end('<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>InvalidSignature</Code><Message>Could not parse signing service</Message></Error>');
    return;
  }

  const service = signingLookup.get(signingName);
  if (!service) {
    debug(`CLI request for unknown signing service: ${signingName}`);
    res.writeHead(400, { 'Content-Type': 'application/xml' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>UnknownService</Code><Message>Unknown service: ${signingName}</Message></Error>`);
    return;
  }

  const parsed = await parseApiRequest(req);
  await dispatchHandler(service, parsed.action, parsed, res);
}
