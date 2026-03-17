import { describe, expect, test } from 'vitest';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { createSTSClient } from '../sdk/client-factory.js';

describe('MockCloud e2e smoke', () => {
  test('serves console home and responds to STS', async () => {
    const endpoint = process.env.MOCKCLOUD_TEST_ENDPOINT;
    expect(endpoint).toBeTruthy();

    const rootResponse = await fetch(`${endpoint}/`, { redirect: 'manual' });
    expect(rootResponse.status).toBe(302);
    expect(rootResponse.headers.get('location')).toBe('/console/home');

    const consoleResponse = await fetch(`${endpoint}/console/home`);
    expect(consoleResponse.status).toBe(200);
    const html = await consoleResponse.text();
    expect(html).toContain('window.__MOCKCLOUD_LOCAL__ = true');
    expect(html).toContain('<div id="app"></div>');
    expect(html).not.toContain('http://localhost:4444');

    const blockedResponse = await fetch(`${endpoint}/health`);
    expect(blockedResponse.status).toBe(204);

    const sts = createSTSClient();
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    expect(identity).toMatchObject({
      Account: '123456789012',
      Arn: 'arn:aws:iam::123456789012:user/mockcloud-user',
      UserId: 'AIDANAWSEXAMPLEUSER',
    });
  });

});
