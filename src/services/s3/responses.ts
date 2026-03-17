import type { ApiResponse } from '../../types.js';
import { REGION } from '../../config.js';

const NS = 'http://s3.amazonaws.com/doc/2006-03-01/';

export function xmlResponse(body: string, statusCode = 200): ApiResponse {
  return { statusCode, headers: { 'Content-Type': 'application/xml' }, body };
}

export function errorResponse(code: string, message: string, statusCode: number): ApiResponse {
  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`,
    statusCode,
  );
}

export function noSuchBucket(bucket: string): ApiResponse {
  return errorResponse('NoSuchBucket', `The specified bucket does not exist: ${bucket}`, 404);
}

export function noSuchKey(key: string): ApiResponse {
  return errorResponse('NoSuchKey', `The specified key does not exist: ${key}`, 404);
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function listBucketsXml(bucketEntries: Array<{ name: string; creationDate: string }>): string {
  const bucketElements = bucketEntries
    .map((b) => `<Bucket><Name>${escapeXml(b.name)}</Name><CreationDate>${b.creationDate}</CreationDate><BucketRegion>${REGION}</BucketRegion><BucketArn>arn:aws:s3:::${escapeXml(b.name)}</BucketArn></Bucket>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><ListAllMyBucketsResult xmlns="${NS}"><Owner><ID>mockcloud-owner-id</ID><DisplayName>mockcloud-user</DisplayName></Owner><Buckets>${bucketElements}</Buckets></ListAllMyBucketsResult>`;
}

export function listObjectsV2Xml(
  bucket: string,
  prefix: string,
  delimiter: string,
  items: Array<{ key: string; lastModified: string; etag: string; size: number }>,
  commonPrefixes: string[],
): string {
  const contentsElements = items
    .map(
      (o) =>
        `<Contents><Key>${escapeXml(o.key)}</Key><LastModified>${o.lastModified}</LastModified><ETag>${escapeXml(o.etag)}</ETag><Size>${o.size}</Size><StorageClass>STANDARD</StorageClass></Contents>`,
    )
    .join('');

  const prefixElements = commonPrefixes
    .map((p) => `<CommonPrefixes><Prefix>${escapeXml(p)}</Prefix></CommonPrefixes>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="${NS}"><Name>${escapeXml(bucket)}</Name><Prefix>${escapeXml(prefix)}</Prefix>${delimiter ? `<Delimiter>${escapeXml(delimiter)}</Delimiter>` : ''}<KeyCount>${items.length}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${contentsElements}${prefixElements}</ListBucketResult>`;
}

export function locationXml(region: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="${NS}">${region}</LocationConstraint>`;
}

export function versioningXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><VersioningConfiguration xmlns="${NS}"/>`;
}

export function encryptionXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><ServerSideEncryptionConfiguration xmlns="${NS}"><Rule><ApplyServerSideEncryptionByDefault><SSEAlgorithm>AES256</SSEAlgorithm></ApplyServerSideEncryptionByDefault><BucketKeyEnabled>false</BucketKeyEnabled></Rule></ServerSideEncryptionConfiguration>`;
}

export function taggingXml(tags: Record<string, string>): string {
  const tagElements = Object.entries(tags)
    .map(([k, v]) => `<Tag><Key>${escapeXml(k)}</Key><Value>${escapeXml(v)}</Value></Tag>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><Tagging xmlns="${NS}"><TagSet>${tagElements}</TagSet></Tagging>`;
}

export function aclXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><AccessControlPolicy xmlns="${NS}"><Owner><ID>mockcloud-owner-id</ID><DisplayName>mockcloud-user</DisplayName></Owner><AccessControlList><Grant><Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser"><ID>mockcloud-owner-id</ID><DisplayName>mockcloud-user</DisplayName></Grantee><Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>`;
}

export function corsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration xmlns="${NS}"/>`;
}

export function lifecycleXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><LifecycleConfiguration xmlns="${NS}"/>`;
}

export function copyObjectResultXml(etag: string, lastModified: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult xmlns="${NS}"><ETag>${escapeXml(etag)}</ETag><LastModified>${lastModified}</LastModified></CopyObjectResult>`;
}
