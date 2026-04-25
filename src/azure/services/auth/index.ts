import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';
import { jsonOk, azureError } from '../../response.js';

function tokenResponse(): ApiResponse {
  return jsonOk({
    token_type: 'Bearer',
    expires_in: 3600,
    ext_expires_in: 3600,
    expires_on: String(Math.floor(Date.now() / 1000) + 3600),
    access_token: 'mockcloud-azure-token',
  });
}

function authorityBase(req: AzureParsedRequest): string {
  const host = req.headers.host ?? req.azureHost;
  const protocol = req.headers['x-forwarded-proto'] ?? 'http';
  return `${protocol}://${host}/azure/login.microsoftonline.com`;
}

function requestedTenant(req: AzureParsedRequest): string {
  const parts = req.azurePath.split('/').filter(Boolean);
  if (parts.length === 0) return 'common';
  if (parts[0].toLowerCase() === 'discovery') return 'common';
  return parts[0];
}

function openIdConfiguration(req: AzureParsedRequest): ApiResponse {
  const authority = authorityBase(req);
  const tenant = requestedTenant(req);
  const authorityTenant = tenant.toLowerCase() === 'common' ? '{tenant}' : tenant;
  const issuerTenant = tenant.toLowerCase() === 'common' ? '{tenantid}' : tenant;
  return jsonOk({
    authorization_endpoint: `${authority}/${authorityTenant}/oauth2/v2.0/authorize`,
    token_endpoint: `${authority}/${authorityTenant}/oauth2/v2.0/token`,
    end_session_endpoint: `${authority}/${authorityTenant}/oauth2/v2.0/logout`,
    issuer: `${authority}/${issuerTenant}/v2.0`,
    jwks_uri: `${authority}/${authorityTenant}/discovery/v2.0/keys`,
  });
}

function instanceDiscovery(req: AzureParsedRequest): ApiResponse {
  const authority = authorityBase(req);
  const host = req.headers.host ?? req.azureHost;
  return jsonOk({
    'tenant_discovery_endpoint': `${authority}/common/v2.0/.well-known/openid-configuration`,
    'api-version': '1.1',
    metadata: [
      {
        preferred_network: 'login.microsoftonline.com',
        preferred_cache: 'login.microsoftonline.com',
        aliases: [
          'login.microsoftonline.com',
          'login.windows.net',
          'login.microsoft.com',
          'sts.windows.net',
          host,
          'localhost',
          'localhost:4444',
          'localhost:4445',
        ],
      },
    ],
  });
}

function jwksResponse(): ApiResponse {
  return jsonOk({ keys: [] });
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  if (req.method === 'POST' && /\/oauth2(?:\/v2\.0)?\/token$/i.test(req.azurePath)) return tokenResponse();
  if (req.method === 'GET' && /\/(?:v2\.0\/)?\.well-known\/openid-configuration$/i.test(req.azurePath)) {
    return openIdConfiguration(req);
  }
  if (req.method === 'GET' && req.azurePath.includes('/discovery/instance')) {
    return instanceDiscovery(req);
  }
  if (req.method === 'GET' && (req.azurePath.endsWith('/keys') || req.azurePath.endsWith('/discovery/keys'))) {
    return jwksResponse();
  }
  return azureError('ResourceNotFound', 'The requested Azure auth resource was not found.', 404);
}

export const azureAuthService: AzureServiceDefinition = {
  name: 'azure-auth',
  hostPatterns: ['login.microsoftonline.com', '*.login.microsoftonline.com'],
  handlers: {
    _default: routeRequest,
  },
};
