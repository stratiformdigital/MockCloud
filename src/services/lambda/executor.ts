import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getObject } from '../s3/index.js';
import { getBaseUrl } from '../../server-url.js';
import type { StoredFunction } from './state.js';
import { extractZipBufferToDirectory } from '../../util/zip.js';
import { REGION } from '../../config.js';

const serverNodeModules = resolve(import.meta.dirname, '../../../node_modules');
const runnerPath = resolve(import.meta.dirname, './invoke-runner.cjs');
const httpsPreloadPath = resolve(import.meta.dirname, './https-to-http-preload.cjs');

export type LambdaExecutionResult =
  | { result: unknown; error?: undefined }
  | { result?: undefined; error: { errorType: string; errorMessage: string; trace: string[] } };

type LambdaExecutionMessage = {
  outcome: LambdaExecutionResult;
  waitForEmptyEventLoop?: boolean;
};

function buildInvocationEnv(fn: StoredFunction, tempDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(fn.environment?.Variables ?? {}),
    AWS_LAMBDA_FUNCTION_NAME: fn.functionName,
    AWS_LAMBDA_FUNCTION_VERSION: '$LATEST',
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE: String(fn.memorySize),
    AWS_REGION: REGION,
    AWS_DEFAULT_REGION: REGION,
    AWS_ENDPOINT_URL: getBaseUrl(),
    AWS_ACCESS_KEY_ID: 'AKIANAWSEXAMPLEKEY00',
    AWS_SECRET_ACCESS_KEY: 'mockcloud-secret-key-for-cli-00000000000000000',
    LAMBDA_TASK_ROOT: tempDir,
    _HANDLER: fn.handler,
    // Fallback module resolution to mockcloud-server's packages (AWS SDK, etc.)
    NODE_PATH: serverNodeModules + (process.env.NODE_PATH ? `:${process.env.NODE_PATH}` : ''),
  };
}

async function runInSubprocess(
  fn: StoredFunction,
  event: unknown,
  tempDir: string,
): Promise<LambdaExecutionResult> {
  return new Promise((resolve) => {
    const child = fork(runnerPath, [], {
      env: buildInvocationEnv(fn, tempDir),
      execArgv: ['--require', httpsPreloadPath],
      silent: true,
    });

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
      if (stderr.length > 8_192) {
        stderr = stderr.slice(-8_192);
      }
    });
    child.stdout?.on('data', () => {});

    let settled = false;
    let timeoutId: NodeJS.Timeout | undefined;
    let pendingOutcome: LambdaExecutionResult | undefined;

    const finish = (result: LambdaExecutionResult): void => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve(result);
    };

    child.once('message', (message: LambdaExecutionMessage) => {
      if (message.waitForEmptyEventLoop) {
        pendingOutcome = message.outcome;
        setTimeout(() => {
          child.kill('SIGKILL');
        }, 2000);
        return;
      }

      finish(message.outcome);
      child.kill('SIGKILL');
    });

    child.once('error', (err) => {
      finish({
        error: {
          errorType: err.constructor.name,
          errorMessage: err.message,
          trace: (err.stack ?? '').split('\n'),
        },
      });
    });

    child.once('exit', (code, signal) => {
      if (pendingOutcome) {
        finish(pendingOutcome);
        return;
      }

      const details = stderr.trim();
      if (code === 0 && signal === null) {
        finish({ result: undefined });
        return;
      }
      finish({
        error: {
          errorType: 'Runtime.ExitError',
          errorMessage: signal
            ? `Lambda subprocess terminated by signal ${signal}`
            : `Lambda subprocess exited with code ${code}${details ? `: ${details}` : ''}`,
          trace: details ? details.split('\n') : [],
        },
      });
    });

    timeoutId = setTimeout(() => {
      child.kill('SIGKILL');
      finish({
        error: {
          errorType: 'TimeoutError',
          errorMessage: `Task timed out after ${fn.timeout.toFixed(2)} seconds`,
          trace: [],
        },
      });
    }, Math.max(fn.timeout, 0) * 1000);

    child.send({
      tempDir,
      handler: fn.handler,
      event,
      functionName: fn.functionName,
      functionArn: fn.functionArn,
      memorySize: fn.memorySize,
      timeout: fn.timeout,
    });
  });
}

export async function executeLambdaHandler(
  fn: StoredFunction,
  event: unknown,
): Promise<LambdaExecutionResult> {
  const zipObj = fn.s3Bucket && fn.s3Key ? getObject(fn.s3Bucket, fn.s3Key) : undefined;
  if (!zipObj) {
    return {
      error: {
        errorType: 'Runtime.NoSuchCode',
        errorMessage: `Code not found: s3://${fn.s3Bucket ?? 'undefined'}/${fn.s3Key ?? 'undefined'}`,
        trace: [],
      },
    };
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'mockcloud-lambda-'));
  await extractZipBufferToDirectory(zipObj.body, tempDir);

  try {
    return await runInSubprocess(fn, event, tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
