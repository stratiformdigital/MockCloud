import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';
import { PersistentMap } from '../../../state/store.js';

interface SearchIndexDefinition {
  service: string;
  name: string;
  fields: Array<Record<string, unknown>>;
  definition: Record<string, unknown>;
  created: string;
  updated: string;
}

interface SearchDocument {
  service: string;
  index: string;
  key: string;
  data: Record<string, unknown>;
  updated: string;
}

const indexes = new PersistentMap<string, SearchIndexDefinition>('azure-search-indexes');
const documents = new PersistentMap<string, SearchDocument>('azure-search-documents');

function serviceName(req: AzureParsedRequest): string {
  const match = req.azureHost.match(/^([^.]+)\.search\.windows\.net$/i);
  return match ? match[1] : 'mocksearch';
}

function pathParts(req: AzureParsedRequest): string[] {
  return req.azurePath
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent)
    .map((segment) => {
      const odata = segment.match(/^([^(]+)\('([^']+)'\)$/);
      return odata ? `${odata[1]}/${odata[2]}` : segment;
    })
    .flatMap((segment) => segment.split('/'));
}

function indexKey(service: string, name: string): string {
  return `${service.toLowerCase()}\0${name.toLowerCase()}`;
}

function documentKey(service: string, index: string, key: string): string {
  return `${service.toLowerCase()}\0${index.toLowerCase()}\0${key}`;
}

function jsonResponse(body: unknown, statusCode = 200, extra: Record<string, string> = {}): ApiResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
    body: JSON.stringify(body),
  };
}

function searchError(code: string, message: string, statusCode = 400): ApiResponse {
  return jsonResponse({ error: { code, message } }, statusCode);
}

function keyFieldName(definition: SearchIndexDefinition): string {
  for (const field of definition.fields) {
    if (field && typeof field === 'object' && (field as Record<string, unknown>).key === true) {
      const name = (field as Record<string, unknown>).name;
      if (typeof name === 'string') return name;
    }
  }
  return 'id';
}

function putIndex(req: AzureParsedRequest, name: string): ApiResponse {
  const service = serviceName(req);
  const body = req.body as Record<string, unknown>;
  const fields = Array.isArray(body.fields) ? (body.fields as Array<Record<string, unknown>>) : [];
  const existing = indexes.get(indexKey(service, name));
  const now = new Date().toISOString();
  const definition: SearchIndexDefinition = {
    service,
    name,
    fields,
    definition: body,
    created: existing?.created ?? now,
    updated: now,
  };
  indexes.set(indexKey(service, name), definition);
  return jsonResponse({ ...body, name }, existing ? 200 : 201);
}

function getIndex(req: AzureParsedRequest, name: string): ApiResponse {
  const service = serviceName(req);
  const definition = indexes.get(indexKey(service, name));
  if (!definition) return searchError('IndexNotFound', `Index '${name}' was not found.`, 404);
  return jsonResponse({ ...definition.definition, name });
}

function listIndexes(req: AzureParsedRequest): ApiResponse {
  const service = serviceName(req);
  const value = Array.from(indexes.values())
    .filter((def) => def.service.toLowerCase() === service.toLowerCase())
    .map((def) => ({ ...def.definition, name: def.name }));
  return jsonResponse({ value });
}

function deleteIndex(req: AzureParsedRequest, name: string): ApiResponse {
  const service = serviceName(req);
  indexes.delete(indexKey(service, name));
  for (const doc of Array.from(documents.values())) {
    if (doc.service.toLowerCase() === service.toLowerCase() && doc.index.toLowerCase() === name.toLowerCase()) {
      documents.delete(documentKey(doc.service, doc.index, doc.key));
    }
  }
  return { statusCode: 204, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '' };
}

function batchDocuments(req: AzureParsedRequest, indexName: string): ApiResponse {
  const service = serviceName(req);
  const definition = indexes.get(indexKey(service, indexName));
  if (!definition) return searchError('IndexNotFound', `Index '${indexName}' was not found.`, 404);

  const body = req.body as Record<string, unknown>;
  const rawActions = Array.isArray(body.value) ? body.value : [];
  const keyField = keyFieldName(definition);
  const results: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();

  for (const raw of rawActions) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const action = raw as Record<string, unknown>;
    const search_action = typeof action['@search.action'] === 'string' ? (action['@search.action'] as string) : 'upload';
    const keyValue = action[keyField];
    if (typeof keyValue !== 'string' && typeof keyValue !== 'number') {
      results.push({ key: '', status: false, errorMessage: `Missing key field '${keyField}'.`, statusCode: 400 });
      continue;
    }
    const key = String(keyValue);
    const existingDoc = documents.get(documentKey(service, indexName, key));

    if (search_action === 'delete') {
      documents.delete(documentKey(service, indexName, key));
      results.push({ key, status: true, errorMessage: null, statusCode: 200 });
      continue;
    }

    const nextData: Record<string, unknown> = { ...action };
    delete (nextData as Record<string, unknown>)['@search.action'];

    if (search_action === 'merge' || search_action === 'mergeOrUpload') {
      const merged = existingDoc ? { ...existingDoc.data, ...nextData } : nextData;
      if (search_action === 'merge' && !existingDoc) {
        results.push({ key, status: false, errorMessage: 'Document not found.', statusCode: 404 });
        continue;
      }
      documents.set(documentKey(service, indexName, key), {
        service,
        index: indexName,
        key,
        data: merged,
        updated: now,
      });
      results.push({ key, status: true, errorMessage: null, statusCode: existingDoc ? 200 : 201 });
      continue;
    }

    documents.set(documentKey(service, indexName, key), {
      service,
      index: indexName,
      key,
      data: nextData,
      updated: now,
    });
    results.push({ key, status: true, errorMessage: null, statusCode: existingDoc ? 200 : 201 });
  }

  return jsonResponse({ value: results });
}

function searchDocuments(req: AzureParsedRequest, indexName: string, options: SearchOptions): ApiResponse {
  const service = serviceName(req);
  const definition = indexes.get(indexKey(service, indexName));
  if (!definition) return searchError('IndexNotFound', `Index '${indexName}' was not found.`, 404);

  const all = Array.from(documents.values()).filter(
    (d) => d.service.toLowerCase() === service.toLowerCase() && d.index.toLowerCase() === indexName.toLowerCase(),
  );

  let matched = all.filter((d) => matchesText(d.data, options.search, options.searchFields));
  if (options.filter) matched = matched.filter((d) => evaluateFilter(d.data, options.filter as string));
  if (options.orderBy) matched = applyOrderBy(matched, options.orderBy);

  const total = matched.length;
  const skipped = matched.slice(options.skip ?? 0);
  const page = skipped.slice(0, options.top ?? 50);
  const value = page.map((d) => ({ '@search.score': 1.0, ...d.data }));

  const response: Record<string, unknown> = { value };
  if (options.count) response['@odata.count'] = total;
  if (options.facets && options.facets.length > 0) {
    response['@search.facets'] = buildFacets(matched, options.facets);
  }
  return jsonResponse(response);
}

interface SearchOptions {
  search: string;
  searchFields?: string[];
  filter?: string;
  orderBy?: string[];
  top?: number;
  skip?: number;
  count?: boolean;
  facets?: string[];
}

function searchOptionsFromQuery(req: AzureParsedRequest): SearchOptions {
  const q = req.queryParams;
  return {
    search: q.search ?? q.$search ?? '*',
    searchFields: q.searchFields ? q.searchFields.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    filter: q.$filter,
    orderBy: q.$orderby ? q.$orderby.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    top: q.$top ? Number(q.$top) : undefined,
    skip: q.$skip ? Number(q.$skip) : undefined,
    count: q.$count === 'true',
    facets: q.facet ? [q.facet] : undefined,
  };
}

function searchOptionsFromBody(req: AzureParsedRequest): SearchOptions {
  const body = req.body as Record<string, unknown>;
  return {
    search: typeof body.search === 'string' ? body.search : '*',
    searchFields:
      typeof body.searchFields === 'string'
        ? body.searchFields.split(',').map((s: string) => s.trim()).filter(Boolean)
        : undefined,
    filter: typeof body.filter === 'string' ? body.filter : undefined,
    orderBy: Array.isArray(body.orderby)
      ? (body.orderby as string[])
      : typeof body.orderby === 'string'
        ? (body.orderby as string).split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
    top: typeof body.top === 'number' ? body.top : undefined,
    skip: typeof body.skip === 'number' ? body.skip : undefined,
    count: body.count === true,
    facets: Array.isArray(body.facets) ? (body.facets as string[]) : undefined,
  };
}

function matchesText(data: Record<string, unknown>, search: string, searchFields?: string[]): boolean {
  const text = search.trim();
  if (!text || text === '*') return true;
  const terms = text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[*]+|[*]+$/g, ''))
    .filter(Boolean);
  if (terms.length === 0) return true;
  const fields = searchFields && searchFields.length > 0 ? searchFields : Object.keys(data);
  const haystack = fields.map((f) => String(data[f] ?? '').toLowerCase()).join(' ');
  return terms.some((term) => haystack.includes(term));
}

function evaluateFilter(data: Record<string, unknown>, filter: string): boolean {
  return filter
    .split(/\s+and\s+/i)
    .every((clause) => evaluateFilterClause(data, clause.trim()));
}

function evaluateFilterClause(data: Record<string, unknown>, clause: string): boolean {
  const orParts = clause.split(/\s+or\s+/i);
  if (orParts.length > 1) return orParts.some((part) => evaluateFilterClause(data, part.trim()));

  const match = clause.match(/^(\w+)\s+(eq|ne|gt|ge|lt|le)\s+(.+)$/i);
  if (!match) return true;
  const [, field, op, rawValue] = match;
  const value = parseOdataValue(rawValue.trim());
  const left = data[field];
  switch (op.toLowerCase()) {
    case 'eq': return leftEq(left, value);
    case 'ne': return !leftEq(left, value);
    case 'gt': return compare(left, value) > 0;
    case 'ge': return compare(left, value) >= 0;
    case 'lt': return compare(left, value) < 0;
    case 'le': return compare(left, value) <= 0;
    default: return true;
  }
}

function parseOdataValue(raw: string): unknown {
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  return raw;
}

function leftEq(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

function compare(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function applyOrderBy(docs: SearchDocument[], orderBy: string[]): SearchDocument[] {
  const sorted = [...docs];
  sorted.sort((a, b) => {
    for (const clause of orderBy) {
      const [field, direction] = clause.split(/\s+/);
      const dir = direction?.toLowerCase() === 'desc' ? -1 : 1;
      const cmp = compare(a.data[field], b.data[field]);
      if (cmp !== 0) return cmp * dir;
    }
    return 0;
  });
  return sorted;
}

function buildFacets(docs: SearchDocument[], facets: string[]): Record<string, Array<Record<string, unknown>>> {
  const result: Record<string, Array<Record<string, unknown>>> = {};
  for (const facet of facets) {
    const [field] = facet.split(',');
    const counts = new Map<string, number>();
    for (const doc of docs) {
      const value = doc.data[field];
      if (value == null) continue;
      const values = Array.isArray(value) ? value.map(String) : [String(value)];
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    result[field] = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }
  return result;
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  const parts = pathParts(req);
  const [root, indexName, third, fourth] = parts;

  if (root === 'indexes' && !indexName && req.method === 'GET') {
    return listIndexes(req);
  }

  if (root === 'indexes' && indexName) {
    if (!third) {
      if (req.method === 'PUT') return putIndex(req, indexName);
      if (req.method === 'GET') return getIndex(req, indexName);
      if (req.method === 'DELETE') return deleteIndex(req, indexName);
    }

    if (third === 'docs' && !fourth && req.method === 'GET') {
      return searchDocuments(req, indexName, searchOptionsFromQuery(req));
    }

    if (third === 'docs' && fourth && req.method === 'POST') {
      const action = fourth.toLowerCase();
      if (action === 'index' || action.endsWith('.index')) {
        return batchDocuments(req, indexName);
      }
      if (
        action === 'search' ||
        action.endsWith('.search') ||
        action === 'search.post.search'
      ) {
        return searchDocuments(req, indexName, searchOptionsFromBody(req));
      }
    }

    if (third === 'docs' && fourth && req.method === 'GET') {
      const definition = indexes.get(indexKey(serviceName(req), indexName));
      if (!definition) return searchError('IndexNotFound', `Index '${indexName}' was not found.`, 404);
      const doc = documents.get(documentKey(serviceName(req), indexName, fourth));
      if (!doc) return searchError('DocumentNotFound', `Document '${fourth}' was not found.`, 404);
      return jsonResponse(doc.data);
    }
  }

  return searchError('NotFound', `The Azure AI Search operation ${req.method} /${parts.join('/')} is not supported by MockCloud.`, 404);
}

export const azureSearchService: AzureServiceDefinition = {
  name: 'azure-search',
  hostPatterns: ['*.search.windows.net'],
  handlers: {
    _default: routeRequest,
  },
};
