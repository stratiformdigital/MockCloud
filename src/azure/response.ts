import type { ApiResponse } from '../types.js';

export class AzureServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}

export const jsonOk = (data: unknown, statusCode = 200): ApiResponse => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(data),
});

export const noContent = (statusCode = 204): ApiResponse => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: '',
});

export const xmlOk = (body: string, statusCode = 200): ApiResponse => ({
  statusCode,
  headers: { 'Content-Type': 'application/xml' },
  body,
});

export const azureError = (code: string, message: string, statusCode = 400): ApiResponse => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ error: { code, message } }),
});
