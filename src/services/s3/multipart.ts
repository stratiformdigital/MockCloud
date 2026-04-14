import { PersistentMap } from '../../state/store.js';
import { randomUUID } from 'node:crypto';
import type { ApiResponse, ParsedApiRequest } from '../../types.js';
import { xmlResponse, errorResponse, escapeXml } from './responses.js';
import { buckets, putObject } from './index.js';
import { dispatchS3Notifications } from './notifications.js';

const NS = 'http://s3.amazonaws.com/doc/2006-03-01/';

interface MultipartUploadPart {
  partNumber: number;
  data: Buffer;
  etag: string;
}

interface MultipartUpload {
  uploadId: string;
  bucketName: string;
  objectKey: string;
  parts: Map<number, MultipartUploadPart>;
  initiatedAt: string;
}

const activeUploads = new PersistentMap<string, MultipartUpload>('s3-multipart-uploads');

function generateEtag(content: Buffer): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const byte = content[i];
    hash = ((hash << 5) - hash) + byte;
    hash |= 0;
  }
  return `"${Math.abs(hash).toString(16).padStart(32, '0')}"`;
}

function noSuchUpload(): ApiResponse {
  return errorResponse('NoSuchUpload', 'The specified multipart upload does not exist.', 404);
}

export function handleCreateMultipartUpload(bucketName: string, objectKey: string): ApiResponse {
  if (!buckets.has(bucketName)) {
    return errorResponse('NoSuchBucket', `The specified bucket does not exist: ${bucketName}`, 404);
  }
  const uploadId = randomUUID();
  activeUploads.set(uploadId, {
    uploadId,
    bucketName,
    objectKey,
    parts: new Map(),
    initiatedAt: new Date().toISOString(),
  });
  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult xmlns="${NS}"><Bucket>${escapeXml(bucketName)}</Bucket><Key>${escapeXml(objectKey)}</Key><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`,
  );
}

export function handleUploadPart(bucketName: string, objectKey: string, req: ParsedApiRequest): ApiResponse {
  const uploadId = req.queryParams['uploadId'] ?? '';
  const partNumber = parseInt(req.queryParams['partNumber'] ?? '0', 10);
  const upload = activeUploads.get(uploadId);
  if (!upload) return noSuchUpload();

  const etag = generateEtag(req.rawBody);
  upload.parts.set(partNumber, { partNumber, data: req.rawBody, etag });
  activeUploads.set(uploadId, upload);
  return { statusCode: 200, headers: { 'Content-Type': 'application/xml', ETag: etag }, body: '' };
}

export function handleCompleteMultipartUpload(bucketName: string, objectKey: string, req: ParsedApiRequest): ApiResponse {
  const uploadId = req.queryParams['uploadId'] ?? '';
  const upload = activeUploads.get(uploadId);
  if (!upload) return noSuchUpload();

  const sortedParts = Array.from(upload.parts.values()).sort((a, b) => a.partNumber - b.partNumber);
  const combined = Buffer.concat(sortedParts.map((p) => p.data));
  const etag = generateEtag(combined);
  const now = new Date().toISOString();

  putObject(bucketName, objectKey, combined, {
    contentType: 'application/octet-stream',
    etag,
    lastModified: now,
    metadata: {},
  });
  activeUploads.delete(uploadId);
  dispatchS3Notifications(bucketName, objectKey, combined.length, etag, 'ObjectCreated:CompleteMultipartUpload');

  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUploadResult xmlns="${NS}"><Location>https://s3.amazonaws.com/${escapeXml(bucketName)}/${escapeXml(objectKey)}</Location><Bucket>${escapeXml(bucketName)}</Bucket><Key>${escapeXml(objectKey)}</Key><ETag>${escapeXml(etag)}</ETag></CompleteMultipartUploadResult>`,
  );
}

export function handleAbortMultipartUpload(bucketName: string, objectKey: string, req: ParsedApiRequest): ApiResponse {
  const uploadId = req.queryParams['uploadId'] ?? '';
  activeUploads.delete(uploadId);
  return { statusCode: 204, headers: { 'Content-Type': 'application/xml' }, body: '' };
}
