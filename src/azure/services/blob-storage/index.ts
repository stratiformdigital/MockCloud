import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';
import { STORAGE_ACCOUNT } from '../../config.js';
import { xmlOk } from '../../response.js';
import { publishBlobCreated } from '../eventgrid/delivery.js';
import {
  containers,
  createContainer,
  deleteContainer,
  getContainer,
  listContainers,
  putBlob,
  getBlob,
  getBlobMeta,
  deleteBlob,
  listBlobs,
  putBlock,
  getBlock,
  listUncommittedBlocks,
  deleteUncommittedBlocks,
} from './storage.js';
import type { AzureBlobContainer, AzureBlobMeta } from './storage.js';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateEtag(content: Buffer | string): string {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  let hash = 0;
  for (let i = 0; i < buf.length; i++) {
    hash = ((hash << 5) - hash) + buf[i];
    hash |= 0;
  }
  return `"0x${Math.abs(hash).toString(16).padStart(16, '0').toUpperCase()}"`;
}

function toRfc7231(iso: string): string {
  return new Date(iso).toUTCString();
}

function accountName(req: AzureParsedRequest): string {
  const match = req.azureHost.match(/^([^.]+)\.(?:blob|web)\.core\.windows\.net$/i);
  return match ? match[1] : STORAGE_ACCOUNT;
}

function isStaticWebsiteHost(req: AzureParsedRequest): boolean {
  return /^[^.]+\.web\.core\.windows\.net$/i.test(req.azureHost);
}

function pathParts(req: AzureParsedRequest): { container: string; blob: string } {
  const parts = req.azurePath.split('/').filter(Boolean).map(decodeURIComponent);
  if (isStaticWebsiteHost(req)) {
    return {
      container: '$web',
      blob: parts.join('/') || 'index.html',
    };
  }
  return {
    container: parts[0] || '',
    blob: parts.slice(1).join('/'),
  };
}

function extractMetadata(headers: Record<string, string>): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower.startsWith('x-ms-meta-')) {
      metadata[lower.slice('x-ms-meta-'.length)] = value;
    }
  }
  return metadata;
}

function storageError(code: string, message: string, statusCode = 400): ApiResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/xml',
      'x-ms-error-code': code,
    },
    body: `<?xml version="1.0" encoding="utf-8"?><Error><Code>${escapeXml(code)}</Code><Message>${escapeXml(message)}</Message></Error>`,
  };
}

function commonBlobHeaders(meta: AzureBlobMeta): Record<string, string> {
  const headers: Record<string, string> = {
    ETag: meta.etag,
    'Last-Modified': toRfc7231(meta.lastModified),
    'Content-Length': String(meta.size),
    'Content-Type': meta.contentType,
    'x-ms-blob-type': 'BlockBlob',
  };
  for (const [key, value] of Object.entries(meta.metadata)) {
    headers[`x-ms-meta-${key}`] = value;
  }
  return headers;
}

function containerListXml(account: string, items: AzureBlobContainer[]): string {
  const containersXml = items.map((container) => `
    <Container>
      <Name>${escapeXml(container.name)}</Name>
      <Properties>
        <Last-Modified>${escapeXml(toRfc7231(container.createdOn))}</Last-Modified>
        <Etag>${escapeXml(generateEtag(container.name + container.createdOn))}</Etag>
        <LeaseStatus>unlocked</LeaseStatus>
        <LeaseState>available</LeaseState>
        <HasImmutabilityPolicy>false</HasImmutabilityPolicy>
        <HasLegalHold>false</HasLegalHold>
      </Properties>
    </Container>`).join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<EnumerationResults ServiceEndpoint="https://${escapeXml(account)}.blob.core.windows.net/">
  <Containers>${containersXml}
  </Containers>
  <NextMarker/>
</EnumerationResults>`;
}

function blobListXml(account: string, container: string, items: AzureBlobMeta[], prefix: string): string {
  const blobsXml = items.map((blob) => `
    <Blob>
      <Name>${escapeXml(blob.name)}</Name>
      <Properties>
        <Creation-Time>${escapeXml(toRfc7231(blob.lastModified))}</Creation-Time>
        <Last-Modified>${escapeXml(toRfc7231(blob.lastModified))}</Last-Modified>
        <Etag>${escapeXml(blob.etag)}</Etag>
        <Content-Length>${blob.size}</Content-Length>
        <Content-Type>${escapeXml(blob.contentType)}</Content-Type>
        <BlobType>BlockBlob</BlobType>
        <LeaseStatus>unlocked</LeaseStatus>
        <LeaseState>available</LeaseState>
      </Properties>
    </Blob>`).join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<EnumerationResults ServiceEndpoint="https://${escapeXml(account)}.blob.core.windows.net/" ContainerName="${escapeXml(container)}">
  <Prefix>${escapeXml(prefix)}</Prefix>
  <Blobs>${blobsXml}
  </Blobs>
  <NextMarker/>
</EnumerationResults>`;
}

function blockListXml(committedIds: string[], uncommitted: Array<{ blockId: string; size: number }>): string {
  const committedXml = committedIds.map((id) => `<Block><Name>${escapeXml(id)}</Name><Size>0</Size></Block>`).join('');
  const uncommittedXml = uncommitted.map((block) => `<Block><Name>${escapeXml(block.blockId)}</Name><Size>${block.size}</Size></Block>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<BlockList>
  <CommittedBlocks>${committedXml}</CommittedBlocks>
  <UncommittedBlocks>${uncommittedXml}</UncommittedBlocks>
</BlockList>`;
}

function parseCommittedBlockIds(rawBody: Buffer): string[] {
  const body = rawBody.toString('utf-8');
  const ids: string[] = [];
  for (const match of body.matchAll(/<(?:Latest|Committed|Uncommitted)>([\s\S]*?)<\/(?:Latest|Committed|Uncommitted)>/g)) {
    ids.push(match[1]);
  }
  return ids;
}

function handleListContainers(req: AzureParsedRequest): ApiResponse {
  const account = accountName(req);
  return xmlOk(containerListXml(account, listContainers(account)));
}

function handleCreateContainer(account: string, container: string, req: AzureParsedRequest): ApiResponse {
  if (!container) return storageError('InvalidUri', 'The requested URI does not represent any resource on the server.', 400);
  if (getContainer(account, container)) {
    return storageError('ContainerAlreadyExists', 'The specified container already exists.', 409);
  }
  const created = createContainer(account, container, extractMetadata(req.headers));
  return {
    statusCode: 201,
    headers: {
      ETag: generateEtag(container + created.createdOn),
      'Last-Modified': toRfc7231(created.createdOn),
      'Content-Type': 'application/xml',
    },
    body: '',
  };
}

function handleDeleteContainer(account: string, container: string): ApiResponse {
  if (!deleteContainer(account, container)) {
    return storageError('ContainerNotFound', 'The specified container does not exist.', 404);
  }
  return { statusCode: 202, headers: { 'Content-Type': 'application/xml' }, body: '' };
}

function handleGetContainerProperties(account: string, container: string): ApiResponse {
  const existing = getContainer(account, container);
  if (!existing) return storageError('ContainerNotFound', 'The specified container does not exist.', 404);
  const headers: Record<string, string> = {
    ETag: generateEtag(container + existing.createdOn),
    'Last-Modified': toRfc7231(existing.createdOn),
    'Content-Type': 'application/xml',
  };
  for (const [key, value] of Object.entries(existing.metadata)) {
    headers[`x-ms-meta-${key}`] = value;
  }
  return { statusCode: 200, headers, body: '' };
}

function handleListBlobs(account: string, container: string, req: AzureParsedRequest): ApiResponse {
  if (!getContainer(account, container)) {
    return storageError('ContainerNotFound', 'The specified container does not exist.', 404);
  }
  const prefix = req.queryParams.prefix ?? '';
  return xmlOk(blobListXml(account, container, listBlobs(account, container, prefix), prefix));
}

function handlePutBlob(account: string, container: string, blob: string, req: AzureParsedRequest): ApiResponse {
  if (!getContainer(account, container)) {
    return storageError('ContainerNotFound', 'The specified container does not exist.', 404);
  }
  const now = new Date().toISOString();
  const etag = generateEtag(req.rawBody);
  const contentType = req.headers['x-ms-blob-content-type'] || req.headers['content-type'] || 'application/octet-stream';
  putBlob(account, container, blob, req.rawBody, {
    contentType,
    etag,
    lastModified: now,
    metadata: extractMetadata(req.headers),
  });
  publishBlobCreated(account, container, blob, req.rawBody.length, contentType);
  return {
    statusCode: 201,
    headers: {
      ETag: etag,
      'Last-Modified': toRfc7231(now),
      'Content-Type': 'application/xml',
      'x-ms-request-server-encrypted': 'true',
    },
    body: '',
  };
}

function handleGetBlob(account: string, container: string, blob: string, req: AzureParsedRequest): ApiResponse {
  if (!getContainer(account, container)) {
    return storageError('ContainerNotFound', 'The specified container does not exist.', 404);
  }
  const object = getBlob(account, container, blob);
  if (!object) return storageError('BlobNotFound', 'The specified blob does not exist.', 404);
  const range = parseRangeHeader(req.headers.range ?? req.headers['x-ms-range'], object.size);
  if (range) {
    const slice = object.body.subarray(range.start, range.end + 1);
    const headers = commonBlobHeaders(object);
    headers['Content-Length'] = String(slice.length);
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${object.size}`;
    return { statusCode: 206, headers, body: '', bodyBuffer: slice };
  }
  return {
    statusCode: 200,
    headers: commonBlobHeaders(object),
    body: '',
    bodyBuffer: object.body,
  };
}

function parseRangeHeader(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = header.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end) return null;
  return { start, end };
}

function handleHeadBlob(account: string, container: string, blob: string): ApiResponse {
  if (!getContainer(account, container)) {
    return storageError('ContainerNotFound', 'The specified container does not exist.', 404);
  }
  const meta = getBlobMeta(account, container, blob);
  if (!meta) return storageError('BlobNotFound', 'The specified blob does not exist.', 404);
  return { statusCode: 200, headers: commonBlobHeaders(meta), body: '' };
}

function handleDeleteBlob(account: string, container: string, blob: string): ApiResponse {
  if (!getContainer(account, container)) {
    return storageError('ContainerNotFound', 'The specified container does not exist.', 404);
  }
  deleteBlob(account, container, blob);
  return { statusCode: 202, headers: { 'Content-Type': 'application/xml' }, body: '' };
}

function handlePutBlock(account: string, container: string, blob: string, req: AzureParsedRequest): ApiResponse {
  if (!getContainer(account, container)) {
    return storageError('ContainerNotFound', 'The specified container does not exist.', 404);
  }
  const blockId = req.queryParams.blockid;
  if (!blockId) return storageError('InvalidQueryParameterValue', 'blockid is required.', 400);
  putBlock(account, container, blob, blockId, req.rawBody);
  return { statusCode: 201, headers: { 'Content-Type': 'application/xml' }, body: '' };
}

function handlePutBlockList(account: string, container: string, blob: string, req: AzureParsedRequest): ApiResponse {
  if (!getContainer(account, container)) {
    return storageError('ContainerNotFound', 'The specified container does not exist.', 404);
  }
  const blockIds = parseCommittedBlockIds(req.rawBody);
  const chunks: Buffer[] = [];
  for (const id of blockIds) {
    const block = getBlock(account, container, blob, id);
    if (!block) return storageError('InvalidBlockList', 'The specified block list is invalid.', 400);
    chunks.push(block);
  }
  const body = Buffer.concat(chunks);
  const now = new Date().toISOString();
  const etag = generateEtag(body);
  const contentType = req.headers['x-ms-blob-content-type'] || 'application/octet-stream';
  putBlob(account, container, blob, body, {
    contentType,
    etag,
    lastModified: now,
    metadata: extractMetadata(req.headers),
    committedBlockIds: blockIds,
  });
  deleteUncommittedBlocks(account, container, blob);
  publishBlobCreated(account, container, blob, body.length, contentType);
  return {
    statusCode: 201,
    headers: {
      ETag: etag,
      'Last-Modified': toRfc7231(now),
      'Content-Type': 'application/xml',
      'x-ms-request-server-encrypted': 'true',
    },
    body: '',
  };
}

function handleGetBlockList(account: string, container: string, blob: string): ApiResponse {
  const meta = getBlobMeta(account, container, blob);
  const uncommitted = listUncommittedBlocks(account, container, blob);
  return xmlOk(blockListXml(meta?.committedBlockIds ?? [], uncommitted));
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  const account = accountName(req);
  const { container, blob } = pathParts(req);
  const staticWebsiteHost = isStaticWebsiteHost(req);
  const comp = (req.queryParams.comp ?? '').toLowerCase();
  const restype = (req.queryParams.restype ?? '').toLowerCase();

  if (!container && req.method === 'GET' && comp === 'list') return handleListContainers(req);

  if (container && !blob) {
    if (req.method === 'PUT' && restype === 'container') return handleCreateContainer(account, container, req);
    if (req.method === 'DELETE' && restype === 'container') return handleDeleteContainer(account, container);
    if (req.method === 'GET' && comp === 'list') return handleListBlobs(account, container, req);
    if (req.method === 'HEAD' || req.method === 'GET') return handleGetContainerProperties(account, container);
  }

  if (container && blob) {
    if (req.method === 'PUT' && comp === 'block') return handlePutBlock(account, container, blob, req);
    if (req.method === 'PUT' && comp === 'blocklist') return handlePutBlockList(account, container, blob, req);
    if (req.method === 'GET' && comp === 'blocklist') return handleGetBlockList(account, container, blob);

    switch (req.method) {
      case 'PUT': return handlePutBlob(account, container, blob, req);
      case 'GET': {
        const response = handleGetBlob(account, container, blob, req);
        return staticWebsiteHost && response.statusCode === 404 && blob !== 'index.html'
          ? handleGetBlob(account, container, 'index.html', req)
          : response;
      }
      case 'HEAD': {
        const response = handleHeadBlob(account, container, blob);
        return staticWebsiteHost && response.statusCode === 404 && blob !== 'index.html'
          ? handleHeadBlob(account, container, 'index.html')
          : response;
      }
      case 'DELETE': return handleDeleteBlob(account, container, blob);
    }
  }

  return storageError('UnsupportedOperation', 'The requested operation is not supported by MockCloud.', 400);
}

export const azureBlobStorageService: AzureServiceDefinition = {
  name: 'azure-blob-storage',
  hostPatterns: ['*.blob.core.windows.net', '*.web.core.windows.net'],
  handlers: {
    _default: routeRequest,
  },
};
