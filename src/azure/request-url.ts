import type { AzureParsedRequest } from '../types.js';

const DEFAULT_AZURE_HTTPS_PORT = 4445;

export function configuredAzureHttpsPort(req: AzureParsedRequest): number {
  return req.azureHttpsPort ?? DEFAULT_AZURE_HTTPS_PORT;
}

export function requestProtocol(req: AzureParsedRequest): 'http' | 'https' {
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (forwardedProto === 'http' || forwardedProto === 'https') {
    return forwardedProto;
  }

  const requestHost = req.headers.host ?? '';
  return requestHost.endsWith(`:${configuredAzureHttpsPort(req)}`) ? 'https' : 'http';
}
