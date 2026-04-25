import { afterAll, describe, expect, test } from 'vitest';
import { createCosmosClient } from './azure-client-factory.js';

describe('Azure Cosmos DB', () => {
  const client = createCosmosClient();

  afterAll(() => {
    client.dispose();
  });

  test('database, container, item, and query lifecycle', async () => {
    const databaseId = `az-cosmos-db-${Date.now()}`;
    const containerId = `az-cosmos-container-${Date.now()}`;

    const { database, resource: databaseResource } = await client.databases.create({ id: databaseId });
    expect(databaseResource?.id).toBe(databaseId);

    const { resources: databaseList } = await client.databases.readAll().fetchAll();
    expect(databaseList.map((item) => item.id)).toContain(databaseId);

    const { container, resource: containerResource } = await database.containers.create({
      id: containerId,
      partitionKey: { paths: ['/pk'] },
    });
    expect(containerResource?.partitionKey?.paths).toEqual(['/pk']);

    const { resources: containerList } = await database.containers.readAll().fetchAll();
    expect(containerList.map((item) => item.id)).toContain(containerId);

    const created = await container.items.create({
      id: 'item-1',
      pk: 'partition-a',
      name: 'alice',
      count: 1,
    });
    expect(created.statusCode).toBe(201);
    expect(created.resource?.id).toBe('item-1');

    const read = await container.item('item-1', 'partition-a').read<Record<string, unknown>>();
    expect(read.resource?.name).toBe('alice');

    const upserted = await container.items.upsert({
      id: 'item-1',
      pk: 'partition-a',
      name: 'alice',
      count: 2,
    });
    expect(upserted.statusCode).toBe(200);
    expect(upserted.resource?.count).toBe(2);

    const query = await container.items.query({
      query: 'SELECT * FROM c WHERE c.pk = @pk',
      parameters: [{ name: '@pk', value: 'partition-a' }],
    }).fetchAll();
    expect(query.resources).toHaveLength(1);
    expect(query.resources[0].id).toBe('item-1');
    expect(query.resources[0].count).toBe(2);

    await container.item('item-1', 'partition-a').delete();
    const missing = await container.item('item-1', 'partition-a').read();
    expect(missing.statusCode).toBe(404);

    await container.delete();
    await database.delete();
  });
});
