import { PersistentMap } from '../../state/store.js';
import type { MockServiceDefinition, ApiResponse, ParsedApiRequest } from '../../types.js';
import {
  xmlResponse,
  errorResponse,
  noSuchBucket,
  noSuchKey,
  listBucketsXml,
  listObjectsV2Xml,
  locationXml,
  versioningXml,
  encryptionXml,
  taggingXml,
  aclXml,
  corsXml,
  lifecycleXml,
  copyObjectResultXml,
} from './responses.js';
import {
  handleCreateMultipartUpload,
  handleUploadPart,
  handleCompleteMultipartUpload,
  handleAbortMultipartUpload,
} from './multipart.js';
import { ServiceError } from '../response.js';
import { REGION } from '../../config.js';
import { dispatchS3Notifications } from './notifications.js';
import {
  putObject,
  getObject,
  getObjectMeta,
  deleteObject,
  listObjects,
  deleteBucketObjects,
} from './storage.js';
import type { Bucket } from '@aws-sdk/client-s3';

export * from './storage.js';

export interface S3Bucket extends Omit<Bucket, 'CreationDate'> {
  CreationDate: string;
  Region: string;
  Tags: Record<string, string>;
  Policy?: string;
  NotificationConfiguration?: string;
}

export const buckets = new PersistentMap<string, S3Bucket>('s3-buckets');

export function createBucket(bucketName: string, region: string, tags?: Record<string, string>): S3Bucket {
  if (buckets.has(bucketName)) {
    throw new ServiceError('BucketAlreadyOwnedByYou', 'Your previous request to create the named bucket succeeded and you already own it.', 409);
  }
  const bucket: S3Bucket = { Name: bucketName, CreationDate: isoNow(), Region: region, Tags: tags ?? {} };
  buckets.set(bucketName, bucket);
  return bucket;
}

export function deleteBucket(bucketName: string): void {
  if (!buckets.has(bucketName)) {
    throw new ServiceError('NoSuchBucket', `The specified bucket does not exist: ${bucketName}`, 404);
  }
  if (listObjects(bucketName).length > 0) {
    throw new ServiceError('BucketNotEmpty', 'The bucket you tried to delete is not empty', 409);
  }
  buckets.delete(bucketName);
  deleteBucketObjects(bucketName);
}

function generateEtag(content: Buffer): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const byte = content[i];
    hash = ((hash << 5) - hash) + byte;
    hash |= 0;
  }
  return `"${Math.abs(hash).toString(16).padStart(32, '0')}"`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function toRfc7231(iso: string): string {
  return new Date(iso).toUTCString();
}

function parsePath(req: ParsedApiRequest): { s3Path: string; bucketName: string; objectKey: string } {
  const apiHostMatch = req.path.match(/^\/api\/([^/]+)(\/.*)?$/);
  const apiHost = apiHostMatch ? apiHostMatch[1] : '';
  const s3Path = apiHostMatch ? (apiHostMatch[2] || '/') : req.path;
  const parts = s3Path.split('/').filter(Boolean).map(decodeURIComponent);

  const hostBucket = extractBucketFromHost(apiHost) || extractBucketFromHost(req.headers['host'] ?? '');
  if (hostBucket) {
    return {
      s3Path,
      bucketName: hostBucket,
      objectKey: parts.join('/'),
    };
  }

  return {
    s3Path,
    bucketName: parts[0] || '',
    objectKey: parts.slice(1).join('/'),
  };
}

function extractBucketFromHost(host: string): string | null {
  const hostname = host.split(':')[0];
  const suffixes = ['.s3.amazonaws.com', '.s3-accelerate.amazonaws.com', '.localhost'];
  for (const suffix of suffixes) {
    if (hostname.endsWith(suffix)) {
      const bucket = hostname.slice(0, -suffix.length);
      if (bucket && !bucket.includes('.s3.')) return bucket;
    }
  }
  const s3Match = hostname.match(/^(.+)\.s3[.-][a-z0-9-]+\.amazonaws\.com$/);
  if (s3Match) return s3Match[1];
  return null;
}

function extractMetadata(headers: Record<string, string>): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.startsWith('x-amz-meta-')) {
      metadata[key.slice('x-amz-meta-'.length)] = value;
    }
  }
  return metadata;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&');
}

function parseBucketTags(req: ParsedApiRequest): Record<string, string> {
  const body = req.body as Record<string, unknown>;
  const tags: Record<string, string> = {};

  if (body['Tagging'] && typeof body['Tagging'] === 'object') {
    const tagSet = (body['Tagging'] as Record<string, unknown>)['TagSet'];
    if (Array.isArray(tagSet)) {
      for (const tag of tagSet as Array<Record<string, string>>) {
        if (tag['Key'] && tag['Value'] !== undefined) tags[tag['Key']] = tag['Value'];
      }
      return tags;
    }
  }

  const rawXml = req.rawBody.toString('utf-8');
  if (!rawXml.includes('<Tag')) return tags;

  const matches = rawXml.matchAll(/<Tag>\s*<Key>([\s\S]*?)<\/Key>\s*<Value>([\s\S]*?)<\/Value>\s*<\/Tag>/g);
  for (const match of matches) {
    tags[decodeXmlText(match[1].trim())] = decodeXmlText(match[2].trim());
  }
  return tags;
}

function ensureBucket(bucketName: string): ApiResponse | null {
  if (!buckets.has(bucketName)) return noSuchBucket(bucketName);
  return null;
}

function handleListBuckets(): ApiResponse {
  const entries = Array.from(buckets.values()).map((b) => ({
    name: b.Name!,
    creationDate: b.CreationDate,
  }));
  return xmlResponse(listBucketsXml(entries));
}

function handleCreateBucket(bucketName: string): ApiResponse {
  try {
    createBucket(bucketName, REGION);
    return xmlResponse('', 200);
  } catch (e) {
    if (e instanceof ServiceError) return errorResponse(e.code, e.message, e.statusCode);
    throw e;
  }
}

function handleDeleteBucket(bucketName: string): ApiResponse {
  try {
    deleteBucket(bucketName);
    return { statusCode: 204, headers: { 'Content-Type': 'application/xml' }, body: '' };
  } catch (e) {
    if (e instanceof ServiceError) return errorResponse(e.code, e.message, e.statusCode);
    throw e;
  }
}

function handleHeadBucket(bucketName: string): ApiResponse {
  if (!buckets.has(bucketName)) return noSuchBucket(bucketName);
  return { statusCode: 200, headers: { 'Content-Type': 'application/xml', 'x-amz-bucket-region': REGION }, body: '' };
}

function handleGetBucketLocation(bucketName: string): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  return xmlResponse(locationXml(buckets.get(bucketName)!.Region));
}

function handleGetBucketVersioning(bucketName: string): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  return xmlResponse(versioningXml());
}

function handleGetBucketEncryption(bucketName: string): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  return xmlResponse(encryptionXml());
}

function handleGetBucketTagging(bucketName: string): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  return xmlResponse(taggingXml(buckets.get(bucketName)!.Tags));
}

function handleGetBucketAcl(bucketName: string): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  return xmlResponse(aclXml());
}

function handleGetBucketPolicy(bucketName: string): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  const bucket = buckets.get(bucketName)!;
  if (!bucket.Policy) {
    return errorResponse('NoSuchBucketPolicy', 'The bucket policy does not exist', 404);
  }
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: bucket.Policy };
}

function handleGetBucketNotificationConfiguration(bucketName: string): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  const bucket = buckets.get(bucketName)!;
  if (bucket.NotificationConfiguration) {
    return xmlResponse(bucket.NotificationConfiguration);
  }
  return xmlResponse('<NotificationConfiguration/>');
}

function handlePutBucketNotificationConfiguration(bucketName: string, req: ParsedApiRequest): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  const bucket = buckets.get(bucketName)!;
  bucket.NotificationConfiguration = req.rawBody.toString('utf-8') || '<NotificationConfiguration/>';
  buckets.set(bucketName, bucket);
  return { statusCode: 200, headers: { 'Content-Type': 'application/xml' }, body: '' };
}

function handleGetBucketCors(bucketName: string): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  return xmlResponse(corsXml());
}

function handleGetBucketLifecycle(bucketName: string): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  return xmlResponse(lifecycleXml());
}

function handlePutBucketTagging(bucketName: string, req: ParsedApiRequest): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  const bucket = buckets.get(bucketName)!;
  bucket.Tags = parseBucketTags(req);
  buckets.set(bucketName, bucket);
  return { statusCode: 204, headers: { 'Content-Type': 'application/xml' }, body: '' };
}

function handlePutBucketPolicy(bucketName: string, req: ParsedApiRequest): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  const bucket = buckets.get(bucketName)!;
  bucket.Policy = JSON.stringify(req.body);
  buckets.set(bucketName, bucket);
  return { statusCode: 204, headers: { 'Content-Type': 'application/xml' }, body: '' };
}

function handleListObjectsV2(bucketName: string, req: ParsedApiRequest): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  const prefix = req.queryParams['prefix'] || '';
  const delimiter = req.queryParams['delimiter'] || '';
  const allObjects = listObjects(bucketName, prefix || undefined);
  const items: Array<{ key: string; lastModified: string; etag: string; size: number }> = [];
  const commonPrefixSet = new Set<string>();

  for (const obj of allObjects) {
    if (delimiter) {
      const rest = obj.key.slice(prefix.length);
      const delimIndex = rest.indexOf(delimiter);
      if (delimIndex >= 0) {
        commonPrefixSet.add(prefix + rest.slice(0, delimIndex + delimiter.length));
        continue;
      }
    }

    items.push({ key: obj.key, lastModified: obj.lastModified, etag: obj.etag, size: obj.size });
  }

  return xmlResponse(
    listObjectsV2Xml(bucketName, prefix, delimiter, items, Array.from(commonPrefixSet).sort()),
  );
}

function handlePutObject(bucketName: string, objectKey: string, req: ParsedApiRequest): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  const bodyBuf = req.rawBody;
  const now = isoNow();
  const etag = generateEtag(bodyBuf);
  const contentType = req.headers['content-type'] || 'application/octet-stream';
  const metadata = extractMetadata(req.headers);
  putObject(bucketName, objectKey, bodyBuf, { contentType, etag, lastModified: now, metadata });
  dispatchS3Notifications(bucketName, objectKey, bodyBuf.length, etag, 'ObjectCreated:Put');
  return { statusCode: 200, headers: { 'Content-Type': 'application/xml', ETag: etag }, body: '' };
}

function handleGetObject(bucketName: string, objectKey: string): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  const obj = getObject(bucketName, objectKey);
  if (!obj) return noSuchKey(objectKey);
  const headers: Record<string, string> = {
    'Content-Type': obj.contentType,
    ETag: obj.etag,
    'Last-Modified': toRfc7231(obj.lastModified),
    'Content-Length': String(obj.size),
  };
  for (const [k, v] of Object.entries(obj.metadata)) {
    headers[`x-amz-meta-${k}`] = v;
  }
  return { statusCode: 200, headers, body: '', bodyBuffer: obj.body };
}

function handleDeleteObject(bucketName: string, objectKey: string): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  const obj = getObjectMeta(bucketName, objectKey);
  const deleted = deleteObject(bucketName, objectKey);
  if (deleted && obj) {
    dispatchS3Notifications(bucketName, objectKey, obj.size, obj.etag, 'ObjectRemoved:Delete');
  }
  return { statusCode: 204, headers: { 'Content-Type': 'application/xml' }, body: '' };
}

function handleHeadObject(bucketName: string, objectKey: string): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  const obj = getObjectMeta(bucketName, objectKey);
  if (!obj) return noSuchKey(objectKey);
  const headers: Record<string, string> = {
    'Content-Type': obj.contentType,
    ETag: obj.etag,
    'Last-Modified': toRfc7231(obj.lastModified),
    'Content-Length': String(obj.size),
  };
  for (const [k, v] of Object.entries(obj.metadata)) {
    headers[`x-amz-meta-${k}`] = v;
  }
  return { statusCode: 200, headers, body: '' };
}

function handleCopyObject(bucketName: string, objectKey: string, req: ParsedApiRequest): ApiResponse {
  const err = ensureBucket(bucketName);
  if (err) return err;
  const copySource = decodeURIComponent(req.headers['x-amz-copy-source'] || '');
  const sourceParts = copySource.replace(/^\//, '').split('/');
  const sourceBucket = sourceParts[0];
  const sourceKey = sourceParts.slice(1).join('/');
  if (!buckets.has(sourceBucket)) return noSuchBucket(sourceBucket);
  const sourceObj = getObject(sourceBucket, sourceKey);
  if (!sourceObj) return noSuchKey(sourceKey);

  const now = isoNow();
  putObject(bucketName, objectKey, sourceObj.body, {
    contentType: sourceObj.contentType,
    etag: sourceObj.etag,
    lastModified: now,
    metadata: sourceObj.metadata,
  });
  dispatchS3Notifications(bucketName, objectKey, sourceObj.body.length, sourceObj.etag, 'ObjectCreated:Copy');
  return xmlResponse(copyObjectResultXml(sourceObj.etag, now));
}

function handleBucketGet(bucketName: string, req: ParsedApiRequest): ApiResponse {
  const qp = req.queryParams;
  if ('location' in qp) return handleGetBucketLocation(bucketName);
  if ('versioning' in qp) return handleGetBucketVersioning(bucketName);
  if ('encryption' in qp) return handleGetBucketEncryption(bucketName);
  if ('tagging' in qp) return handleGetBucketTagging(bucketName);
  if ('acl' in qp) return handleGetBucketAcl(bucketName);
  if ('policy' in qp) return handleGetBucketPolicy(bucketName);
  if ('notification' in qp) return handleGetBucketNotificationConfiguration(bucketName);
  if ('cors' in qp) return handleGetBucketCors(bucketName);
  if ('lifecycle' in qp) return handleGetBucketLifecycle(bucketName);
  if ('uploads' in qp) return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>' + bucketName + '</Bucket><KeyMarker/><UploadIdMarker/><MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>');
  return handleListObjectsV2(bucketName, req);
}

function handleBucketPut(bucketName: string, req: ParsedApiRequest): ApiResponse {
  const qp = req.queryParams;
  if ('tagging' in qp) return handlePutBucketTagging(bucketName, req);
  if ('policy' in qp) return handlePutBucketPolicy(bucketName, req);
  if ('notification' in qp) return handlePutBucketNotificationConfiguration(bucketName, req);
  return handleCreateBucket(bucketName);
}

function routeRequest(req: ParsedApiRequest): ApiResponse {
  const { s3Path, bucketName, objectKey } = parsePath(req);
  const method = req.method;

  if (s3Path === '/' && method === 'GET' && !bucketName) return handleListBuckets();
  if (s3Path === '/' && method === 'HEAD') return xmlResponse('', 200);

  if (bucketName && !objectKey) {
    switch (method) {
      case 'HEAD': return handleHeadBucket(bucketName);
      case 'GET': return handleBucketGet(bucketName, req);
      case 'PUT': return handleBucketPut(bucketName, req);
      case 'DELETE': return handleDeleteBucket(bucketName);
      default: return xmlResponse('', 200);
    }
  }

  if (bucketName && objectKey) {
    const qp = req.queryParams;

    if (method === 'POST' && 'uploads' in qp) {
      return handleCreateMultipartUpload(bucketName, objectKey);
    }
    if (method === 'POST' && 'uploadId' in qp) {
      return handleCompleteMultipartUpload(bucketName, objectKey, req);
    }
    if (method === 'PUT' && 'partNumber' in qp && 'uploadId' in qp) {
      return handleUploadPart(bucketName, objectKey, req);
    }
    if (method === 'DELETE' && 'uploadId' in qp) {
      return handleAbortMultipartUpload(bucketName, objectKey, req);
    }

    switch (method) {
      case 'PUT':
        if (req.headers['x-amz-copy-source']) return handleCopyObject(bucketName, objectKey, req);
        return handlePutObject(bucketName, objectKey, req);
      case 'GET': return handleGetObject(bucketName, objectKey);
      case 'DELETE': return handleDeleteObject(bucketName, objectKey);
      case 'HEAD': return handleHeadObject(bucketName, objectKey);
      default: return xmlResponse('', 200);
    }
  }

  return xmlResponse('', 200);
}

export const s3Service: MockServiceDefinition = {
  name: 's3',
  hostPatterns: ['s3.*.amazonaws.com', 's3.amazonaws.com', '*.s3.*.amazonaws.com', '*.s3.amazonaws.com', '*.localhost'],
  protocol: 'rest-xml',
  signingName: 's3',
  handlers: {
    _default: (req) => routeRequest(req),
  },
};
