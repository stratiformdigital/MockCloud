import { describe, expect, test } from 'vitest';
import { getTestEndpoint } from './client-factory.js';

const apiVersion = '2024-07-01';

function serviceEndpoint(service = 'mocksearch'): string {
  return `${getTestEndpoint()}/azure/${service}.search.windows.net`;
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

describe('Azure AI Search', () => {
  test('index lifecycle and document batch operations', async () => {
    const indexName = `idx-${Date.now()}`;
    const endpoint = serviceEndpoint();

    const created = await fetch(`${endpoint}/indexes/${indexName}?api-version=${apiVersion}`, {
      method: 'PUT',
      headers: { 'api-key': 'mockcloud', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: indexName,
        fields: [
          { name: 'id', type: 'Edm.String', key: true, filterable: true },
          { name: 'status', type: 'Edm.String', filterable: true, facetable: true },
          { name: 'searchableText', type: 'Edm.String', searchable: true },
        ],
      }),
    });
    expect([200, 201]).toContain(created.status);

    const indexResponse = await json<Record<string, any>>(
      await fetch(`${endpoint}/indexes/${indexName}?api-version=${apiVersion}`, {
        headers: { 'api-key': 'mockcloud' },
      }),
    );
    expect(indexResponse.name).toBe(indexName);
    expect(indexResponse.fields.length).toBe(3);

    const batch = await json<Record<string, any>>(
      await fetch(`${endpoint}/indexes/${indexName}/docs/index?api-version=${apiVersion}`, {
        method: 'POST',
        headers: { 'api-key': 'mockcloud', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: [
            { '@search.action': 'mergeOrUpload', id: 'a', status: 'submitted', searchableText: 'apple pie' },
            { '@search.action': 'mergeOrUpload', id: 'b', status: 'draft', searchableText: 'banana bread' },
            { '@search.action': 'mergeOrUpload', id: 'c', status: 'submitted', searchableText: 'cherry cobbler' },
          ],
        }),
      }),
    );
    expect(batch.value.length).toBe(3);
    expect(batch.value.every((v: Record<string, any>) => v.status === true)).toBe(true);
  });

  test('search with filter, facets, and $count returns expected results', async () => {
    const indexName = `idx-${Date.now()}`;
    const endpoint = serviceEndpoint();

    await fetch(`${endpoint}/indexes/${indexName}?api-version=${apiVersion}`, {
      method: 'PUT',
      headers: { 'api-key': 'mockcloud', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: indexName,
        fields: [
          { name: 'id', type: 'Edm.String', key: true, filterable: true },
          { name: 'status', type: 'Edm.String', filterable: true, facetable: true },
          { name: 'searchableText', type: 'Edm.String', searchable: true },
        ],
      }),
    });

    await fetch(`${endpoint}/indexes/${indexName}/docs/index?api-version=${apiVersion}`, {
      method: 'POST',
      headers: { 'api-key': 'mockcloud', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: [
          { '@search.action': 'mergeOrUpload', id: '1', status: 'submitted', searchableText: 'apple pie' },
          { '@search.action': 'mergeOrUpload', id: '2', status: 'draft', searchableText: 'apple crisp' },
          { '@search.action': 'mergeOrUpload', id: '3', status: 'submitted', searchableText: 'banana bread' },
        ],
      }),
    });

    const searchResponse = await json<Record<string, any>>(
      await fetch(`${endpoint}/indexes/${indexName}/docs/search?api-version=${apiVersion}`, {
        method: 'POST',
        headers: { 'api-key': 'mockcloud', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search: 'apple',
          searchFields: 'searchableText',
          filter: "status eq 'submitted'",
          facets: ['status'],
          count: true,
        }),
      }),
    );

    expect(searchResponse['@odata.count']).toBe(1);
    expect(searchResponse.value.length).toBe(1);
    expect(searchResponse.value[0].id).toBe('1');
    expect(searchResponse['@search.facets'].status.length).toBeGreaterThan(0);
  });

  test('search * returns all documents with pagination and order', async () => {
    const indexName = `idx-${Date.now()}`;
    const endpoint = serviceEndpoint();

    await fetch(`${endpoint}/indexes/${indexName}?api-version=${apiVersion}`, {
      method: 'PUT',
      headers: { 'api-key': 'mockcloud', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: indexName,
        fields: [
          { name: 'id', type: 'Edm.String', key: true },
          { name: 'counter', type: 'Edm.Int32', sortable: true },
        ],
      }),
    });

    await fetch(`${endpoint}/indexes/${indexName}/docs/index?api-version=${apiVersion}`, {
      method: 'POST',
      headers: { 'api-key': 'mockcloud', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: Array.from({ length: 5 }, (_, i) => ({
          '@search.action': 'upload',
          id: `doc-${i}`,
          counter: i,
        })),
      }),
    });

    const page = await json<Record<string, any>>(
      await fetch(`${endpoint}/indexes/${indexName}/docs/search?api-version=${apiVersion}`, {
        method: 'POST',
        headers: { 'api-key': 'mockcloud', 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: '*', orderby: 'counter desc', top: 2, skip: 1, count: true }),
      }),
    );

    expect(page['@odata.count']).toBe(5);
    expect(page.value.map((v: Record<string, any>) => v.id)).toEqual(['doc-3', 'doc-2']);
  });

  test('merge fails when document does not exist, delete removes it', async () => {
    const indexName = `idx-${Date.now()}`;
    const endpoint = serviceEndpoint();

    await fetch(`${endpoint}/indexes/${indexName}?api-version=${apiVersion}`, {
      method: 'PUT',
      headers: { 'api-key': 'mockcloud', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: indexName,
        fields: [{ name: 'id', type: 'Edm.String', key: true }, { name: 'status', type: 'Edm.String' }],
      }),
    });

    const mergeResponse = await json<Record<string, any>>(
      await fetch(`${endpoint}/indexes/${indexName}/docs/index?api-version=${apiVersion}`, {
        method: 'POST',
        headers: { 'api-key': 'mockcloud', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: [{ '@search.action': 'merge', id: 'missing', status: 'submitted' }],
        }),
      }),
    );
    expect(mergeResponse.value[0].status).toBe(false);
    expect(mergeResponse.value[0].statusCode).toBe(404);

    await fetch(`${endpoint}/indexes/${indexName}/docs/index?api-version=${apiVersion}`, {
      method: 'POST',
      headers: { 'api-key': 'mockcloud', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: [
          { '@search.action': 'upload', id: 'x', status: 'submitted' },
          { '@search.action': 'delete', id: 'x' },
        ],
      }),
    });

    const afterDelete = await json<Record<string, any>>(
      await fetch(`${endpoint}/indexes/${indexName}/docs/search?api-version=${apiVersion}`, {
        method: 'POST',
        headers: { 'api-key': 'mockcloud', 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: '*', count: true }),
      }),
    );
    expect(afterDelete['@odata.count']).toBe(0);
  });
});
