import { describe, test, expect } from 'vitest';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { createSTSClient } from './client-factory.js';

describe('STS', () => {
  const client = createSTSClient();

  test('GetCallerIdentity returns valid identity', async () => {
    const result = await client.send(new GetCallerIdentityCommand({}));
    expect(result.Account).toBe('000000000000');
    expect(result.Arn).toBeDefined();
    expect(result.UserId).toBeDefined();
  });
});
