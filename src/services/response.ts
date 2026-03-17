import type { ApiResponse } from '../types.js';

export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
  }
}

// application/json (Lambda, API Gateway, etc.)
export const json = (data: unknown, statusCode = 200): ApiResponse => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

// application/x-amz-json-1.1 (KMS, EventBridge, SSM, Logs, Cognito, WAFv2, SecretsManager, etc.)
export const jsonAmz11 = (data: unknown): ApiResponse => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/x-amz-json-1.1' },
  body: JSON.stringify(data),
});

export const errorAmz11 = (code: string, message: string, statusCode = 400): ApiResponse => ({
  statusCode,
  headers: { 'Content-Type': 'application/x-amz-json-1.1' },
  body: JSON.stringify({ __type: code, message }),
});
