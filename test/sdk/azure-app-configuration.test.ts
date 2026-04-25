import { describe, expect, test } from 'vitest';
import { createAppConfigurationClient } from './azure-client-factory.js';

describe('Azure App Configuration', () => {
  const client = createAppConfigurationClient();

  test('configuration setting lifecycle', async () => {
    const key = `az-appconfig-${Date.now()}`;
    const label = 'dev';

    const created = await client.addConfigurationSetting({
      key,
      label,
      value: 'first-value',
      contentType: 'text/plain',
      tags: { owner: 'mockcloud' },
    });
    expect(created.key).toBe(key);
    expect(created.label).toBe(label);
    expect(created.value).toBe('first-value');
    expect(created.contentType).toBe('text/plain');

    await expect(client.addConfigurationSetting({ key, label, value: 'duplicate' }))
      .rejects.toMatchObject({ statusCode: 412 });

    const read = await client.getConfigurationSetting({ key, label });
    expect(read.value).toBe('first-value');
    expect(read.tags?.owner).toBe('mockcloud');

    const updated = await client.setConfigurationSetting({
      key,
      label,
      value: 'second-value',
      contentType: 'application/json',
    });
    expect(updated.value).toBe('second-value');
    expect(updated.contentType).toBe('application/json');

    const listed: string[] = [];
    for await (const setting of client.listConfigurationSettings({ keyFilter: 'az-appconfig-*', labelFilter: label })) {
      listed.push(setting.key);
    }
    expect(listed).toContain(key);

    const labels: string[] = [];
    for await (const item of client.listLabels({ nameFilter: label })) {
      labels.push(item.name);
    }
    expect(labels).toContain(label);

    const deleted = await client.deleteConfigurationSetting({ key, label });
    expect(deleted.key).toBe(key);
    expect(deleted.value).toBe('second-value');

    await expect(client.getConfigurationSetting({ key, label }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
