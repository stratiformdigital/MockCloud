import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test, expect } from 'vitest';
import {
  ListFunctionsCommand,
  GetFunctionCommand,
  CreateFunctionCommand,
  DeleteFunctionCommand,
  InvokeCommand,
} from '@aws-sdk/client-lambda';
import {
  CreateBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import JSZip from 'jszip';
import { createLambdaClient } from './client-factory.js';
import { createS3Client } from './client-factory.js';

describe('Lambda', () => {
  const client = createLambdaClient();
  const s3 = createS3Client();

  test('ListFunctions returns an array', async () => {
    const result = await client.send(new ListFunctionsCommand({}));
    expect(result.Functions).toBeDefined();
    expect(Array.isArray(result.Functions)).toBe(true);
  });

  test('GetFunction on nonexistent function returns ResourceNotFoundException', async () => {
    try {
      await client.send(new GetFunctionCommand({ FunctionName: 'nonexistent-fn-xyz' }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });

  test('Invoke executes handler code from a ZIP archive without host unzip', async () => {
    const timestamp = Date.now();
    const bucketName = `lambda-zip-${timestamp}`;
    const objectKey = 'code/handler.zip';
    const functionName = `zip-handler-${timestamp}`;

    const archive = new JSZip();
    archive.file('index.js', `
exports.handler = async (event) => ({
  echoed: event.message,
  functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
  region: process.env.AWS_REGION,
});
`);
    const zipBody = await archive.generateAsync({ type: 'nodebuffer' });

    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBody,
      ContentType: 'application/zip',
    }));

    try {
      await client.send(new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs20.x',
        Role: 'arn:aws:iam::123456789012:role/lambda-role',
        Handler: 'index.handler',
        Code: {
          S3Bucket: bucketName,
          S3Key: objectKey,
        },
      }));

      const result = await client.send(new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from(JSON.stringify({ message: 'hello-from-zip' })),
      }));

      const payload = JSON.parse(Buffer.from(result.Payload ?? []).toString('utf-8'));
      expect(payload).toEqual({
        echoed: 'hello-from-zip',
        functionName,
        region: 'us-east-1',
      });
    } finally {
      await client.send(new DeleteFunctionCommand({ FunctionName: functionName })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName })).catch(() => undefined);
    }
  });

  test('Invoke executes ESM handlers packaged as index.mjs', async () => {
    const timestamp = Date.now();
    const bucketName = `lambda-esm-${timestamp}`;
    const objectKey = 'code/handler.zip';
    const functionName = `esm-handler-${timestamp}`;

    const archive = new JSZip();
    archive.file('index.mjs', `
export async function handler(event) {
  return {
    echoed: event.message,
    esm: true,
  };
}
`);
    const zipBody = await archive.generateAsync({ type: 'nodebuffer' });

    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBody,
      ContentType: 'application/zip',
    }));

    try {
      await client.send(new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs20.x',
        Role: 'arn:aws:iam::123456789012:role/lambda-role',
        Handler: 'index.handler',
        Code: {
          S3Bucket: bucketName,
          S3Key: objectKey,
        },
      }));

      const result = await client.send(new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from(JSON.stringify({ message: 'hello-esm' })),
      }));

      const payload = JSON.parse(Buffer.from(result.Payload ?? []).toString('utf-8'));
      expect(payload).toEqual({
        echoed: 'hello-esm',
        esm: true,
      });
    } finally {
      await client.send(new DeleteFunctionCommand({ FunctionName: functionName })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName })).catch(() => undefined);
    }
  });

  test('Invoke supports callback-style handlers', async () => {
    const timestamp = Date.now();
    const bucketName = `lambda-callback-${timestamp}`;
    const objectKey = 'code/handler.zip';
    const functionName = `callback-handler-${timestamp}`;

    const archive = new JSZip();
    archive.file('index.js', `
exports.handler = (event, context, callback) => {
  callback(null, {
    echoed: event.message,
    requestId: context.awsRequestId,
  });
};
`);
    const zipBody = await archive.generateAsync({ type: 'nodebuffer' });

    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBody,
      ContentType: 'application/zip',
    }));

    try {
      await client.send(new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs20.x',
        Role: 'arn:aws:iam::123456789012:role/lambda-role',
        Handler: 'index.handler',
        Code: {
          S3Bucket: bucketName,
          S3Key: objectKey,
        },
      }));

      const result = await client.send(new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from(JSON.stringify({ message: 'hello-callback' })),
      }));

      const payload = JSON.parse(Buffer.from(result.Payload ?? []).toString('utf-8'));
      expect(result.FunctionError).toBeUndefined();
      expect(payload.echoed).toBe('hello-callback');
      expect(typeof payload.requestId).toBe('string');
      expect(payload.requestId.length).toBeGreaterThan(0);
    } finally {
      await client.send(new DeleteFunctionCommand({ FunctionName: functionName })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName })).catch(() => undefined);
    }
  });

  test('Invoke waits for the event loop when callbackWaitsForEmptyEventLoop is true', async () => {
    const timestamp = Date.now();
    const bucketName = `lambda-event-loop-${timestamp}`;
    const objectKey = 'code/handler.zip';
    const functionName = `event-loop-handler-${timestamp}`;

    const archive = new JSZip();
    archive.file('index.js', `
exports.handler = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = true;
  setTimeout(() => {}, 500);
  callback(null, {
    echoed: event.message,
  });
};
`);
    const zipBody = await archive.generateAsync({ type: 'nodebuffer' });

    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBody,
      ContentType: 'application/zip',
    }));

    try {
      await client.send(new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs20.x',
        Role: 'arn:aws:iam::123456789012:role/lambda-role',
        Handler: 'index.handler',
        Timeout: 2,
        Code: {
          S3Bucket: bucketName,
          S3Key: objectKey,
        },
      }));

      const started = Date.now();
      const result = await client.send(new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from(JSON.stringify({ message: 'wait-for-loop' })),
      }));
      const elapsedMs = Date.now() - started;
      const payload = JSON.parse(Buffer.from(result.Payload ?? []).toString('utf-8'));

      expect(result.FunctionError).toBeUndefined();
      expect(payload).toEqual({
        echoed: 'wait-for-loop',
      });
      expect(elapsedMs).toBeGreaterThanOrEqual(450);
    } finally {
      await client.send(new DeleteFunctionCommand({ FunctionName: functionName })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName })).catch(() => undefined);
    }
  });

  test('Invoke returns 202 and runs asynchronously for InvocationType Event', { timeout: 15_000 }, async () => {
    const timestamp = Date.now();
    const bucketName = `lambda-async-${timestamp}`;
    const objectKey = 'code/handler.zip';
    const functionName = `async-handler-${timestamp}`;
    const markerPath = join(tmpdir(), `mockcloud-lambda-event-${timestamp}.txt`);

    rmSync(markerPath, { force: true });

    const archive = new JSZip();
    archive.file('index.js', `
const { writeFileSync } = require('node:fs');

exports.handler = async (event) => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  writeFileSync(event.markerPath, 'ran');
  return { echoed: event.message };
};
`);
    const zipBody = await archive.generateAsync({ type: 'nodebuffer' });

    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBody,
      ContentType: 'application/zip',
    }));

    try {
      await client.send(new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs20.x',
        Role: 'arn:aws:iam::123456789012:role/lambda-role',
        Handler: 'index.handler',
        Timeout: 2,
        Code: {
          S3Bucket: bucketName,
          S3Key: objectKey,
        },
      }));

      const started = Date.now();
      const result = await client.send(new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ message: 'hello-event', markerPath })),
      }));
      const elapsedMs = Date.now() - started;

      expect(result.StatusCode).toBe(202);
      expect(result.FunctionError).toBeUndefined();
      expect(Buffer.from(result.Payload ?? []).length).toBe(0);
      expect(elapsedMs).toBeLessThan(250);
      expect(existsSync(markerPath)).toBe(false);

      const deadline = Date.now() + 5000;
      while (!existsSync(markerPath) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(existsSync(markerPath)).toBe(true);
    } finally {
      rmSync(markerPath, { force: true });
      await client.send(new DeleteFunctionCommand({ FunctionName: functionName })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName })).catch(() => undefined);
    }
  });

  test('Invoke returns 204 and does not execute for InvocationType DryRun', async () => {
    const timestamp = Date.now();
    const bucketName = `lambda-dryrun-${timestamp}`;
    const objectKey = 'code/handler.zip';
    const functionName = `dryrun-handler-${timestamp}`;
    const markerPath = join(tmpdir(), `mockcloud-lambda-dryrun-${timestamp}.txt`);

    rmSync(markerPath, { force: true });

    const archive = new JSZip();
    archive.file('index.js', `
const { writeFileSync } = require('node:fs');

exports.handler = async (event) => {
  writeFileSync(event.markerPath, 'ran');
  return { ok: true };
};
`);
    const zipBody = await archive.generateAsync({ type: 'nodebuffer' });

    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBody,
      ContentType: 'application/zip',
    }));

    try {
      await client.send(new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs20.x',
        Role: 'arn:aws:iam::123456789012:role/lambda-role',
        Handler: 'index.handler',
        Code: {
          S3Bucket: bucketName,
          S3Key: objectKey,
        },
      }));

      const started = Date.now();
      const result = await client.send(new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'DryRun',
        Payload: Buffer.from(JSON.stringify({ markerPath })),
      }));
      const elapsedMs = Date.now() - started;

      expect(result.StatusCode).toBe(204);
      expect(result.FunctionError).toBeUndefined();
      expect(Buffer.from(result.Payload ?? []).length).toBe(0);
      expect(elapsedMs).toBeLessThan(250);

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(existsSync(markerPath)).toBe(false);
    } finally {
      rmSync(markerPath, { force: true });
      await client.send(new DeleteFunctionCommand({ FunctionName: functionName })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName })).catch(() => undefined);
    }
  });

  test('Invoke updates context remaining time as the handler runs', { timeout: 15_000 }, async () => {
    const timestamp = Date.now();
    const bucketName = `lambda-remaining-${timestamp}`;
    const objectKey = 'code/handler.zip';
    const functionName = `remaining-handler-${timestamp}`;

    const archive = new JSZip();
    archive.file('index.js', `
exports.handler = async (event, context) => {
  const before = context.getRemainingTimeInMillis();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const after = context.getRemainingTimeInMillis();
  return { before, after };
};
`);
    const zipBody = await archive.generateAsync({ type: 'nodebuffer' });

    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBody,
      ContentType: 'application/zip',
    }));

    try {
      await client.send(new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs20.x',
        Role: 'arn:aws:iam::123456789012:role/lambda-role',
        Handler: 'index.handler',
        Timeout: 10,
        Code: {
          S3Bucket: bucketName,
          S3Key: objectKey,
        },
      }));

      const result = await client.send(new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from('{}'),
      }));

      const payload = JSON.parse(Buffer.from(result.Payload ?? []).toString('utf-8'));
      expect(payload.before).toBeGreaterThan(payload.after);
      expect(payload.after).toBeLessThanOrEqual(payload.before - 200);
    } finally {
      await client.send(new DeleteFunctionCommand({ FunctionName: functionName })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName })).catch(() => undefined);
    }
  });

  test('concurrent invokes keep per-function environment isolated', async () => {
    const timestamp = Date.now();
    const bucketName = `lambda-race-${timestamp}`;
    const objectKey = 'code/handler.zip';
    const functionA = `zip-race-a-${timestamp}`;
    const functionB = `zip-race-b-${timestamp}`;

    const archive = new JSZip();
    archive.file('index.js', `
exports.handler = async (event) => {
  const before = process.env.MARK;
  await new Promise((resolve) => setTimeout(resolve, event.delay));
  return {
    before,
    after: process.env.MARK,
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
  };
};
`);
    const zipBody = await archive.generateAsync({ type: 'nodebuffer' });

    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBody,
      ContentType: 'application/zip',
    }));

    try {
      await client.send(new CreateFunctionCommand({
        FunctionName: functionA,
        Runtime: 'nodejs20.x',
        Role: 'arn:aws:iam::123456789012:role/lambda-role',
        Handler: 'index.handler',
        Code: {
          S3Bucket: bucketName,
          S3Key: objectKey,
        },
        Environment: {
          Variables: { MARK: 'A' },
        },
      }));
      await client.send(new CreateFunctionCommand({
        FunctionName: functionB,
        Runtime: 'nodejs20.x',
        Role: 'arn:aws:iam::123456789012:role/lambda-role',
        Handler: 'index.handler',
        Code: {
          S3Bucket: bucketName,
          S3Key: objectKey,
        },
        Environment: {
          Variables: { MARK: 'B' },
        },
      }));

      for (let i = 0; i < 5; i++) {
        const [resultA, resultB] = await Promise.all([
          client.send(new InvokeCommand({
            FunctionName: functionA,
            Payload: Buffer.from(JSON.stringify({ delay: 25 })),
          })),
          client.send(new InvokeCommand({
            FunctionName: functionB,
            Payload: Buffer.from(JSON.stringify({ delay: 25 })),
          })),
        ]);

        const payloadA = JSON.parse(Buffer.from(resultA.Payload ?? []).toString('utf-8'));
        const payloadB = JSON.parse(Buffer.from(resultB.Payload ?? []).toString('utf-8'));

        expect(payloadA).toEqual({
          before: 'A',
          after: 'A',
          functionName: functionA,
        });
        expect(payloadB).toEqual({
          before: 'B',
          after: 'B',
          functionName: functionB,
        });
      }
    } finally {
      await client.send(new DeleteFunctionCommand({ FunctionName: functionA })).catch(() => undefined);
      await client.send(new DeleteFunctionCommand({ FunctionName: functionB })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName })).catch(() => undefined);
    }
  });

  test('Invoke enforces function timeout', async () => {
    const timestamp = Date.now();
    const bucketName = `lambda-timeout-${timestamp}`;
    const objectKey = 'code/handler.zip';
    const functionName = `timeout-handler-${timestamp}`;

    const archive = new JSZip();
    archive.file('index.js', `
exports.handler = async () => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return { ok: true };
};
`);
    const zipBody = await archive.generateAsync({ type: 'nodebuffer' });

    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBody,
      ContentType: 'application/zip',
    }));

    try {
      await client.send(new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs20.x',
        Role: 'arn:aws:iam::123456789012:role/lambda-role',
        Handler: 'index.handler',
        Timeout: 1,
        Code: {
          S3Bucket: bucketName,
          S3Key: objectKey,
        },
      }));

      const started = Date.now();
      const result = await client.send(new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from('{}'),
      }));
      const elapsedMs = Date.now() - started;
      const payload = JSON.parse(Buffer.from(result.Payload ?? []).toString('utf-8'));

      expect(result.FunctionError).toBe('Unhandled');
      expect(payload.errorType).toBe('TimeoutError');
      expect(payload.errorMessage).toContain('Task timed out after 1.00 seconds');
      expect(elapsedMs).toBeLessThan(1400);
    } finally {
      await client.send(new DeleteFunctionCommand({ FunctionName: functionName })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName })).catch(() => undefined);
    }
  });
});
