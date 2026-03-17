import { describe, test, expect } from 'vitest';
import {
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  PutBucketTaggingCommand,
  GetBucketTaggingCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import { createS3Client } from './client-factory.js';

async function streamToBuffer(stream: ReadableStream | NodeJS.ReadableStream | undefined): Promise<Buffer> {
  if (!stream) throw new Error('No stream');
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('S3', () => {
  const client = createS3Client();

  test('CRUD lifecycle', async () => {
    const bucketName = `sdk-test-${Date.now()}`;

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));

    const testData = Buffer.from('Hello MockCloud! Binary test: \x00\x01\x02\xff');
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: 'test-file.bin',
      Body: testData,
      ContentType: 'application/octet-stream',
    }));

    const getResult = await client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: 'test-file.bin',
    }));
    const body = await streamToBuffer(getResult.Body as NodeJS.ReadableStream);
    expect(body).toEqual(testData);

    const listResult = await client.send(new ListObjectsV2Command({
      Bucket: bucketName,
    }));
    expect(listResult.KeyCount).toBe(1);
    expect(listResult.Contents?.[0]?.Key).toBe('test-file.bin');

    await client.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: 'test-file.bin',
    }));

    await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
  });

  test('GetObject on nonexistent key returns NoSuchKey', async () => {
    const bucketName = `sdk-test-err-${Date.now()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));

    try {
      await expect(
        client.send(new GetObjectCommand({
          Bucket: bucketName,
          Key: 'nonexistent-key-xyz',
        })),
      ).rejects.toThrow();

      await client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: 'nonexistent-key-xyz',
      }));
    } catch (err: any) {
      expect(err.name).toBe('NoSuchKey');
    } finally {
      await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
    }
  });

  test('GetObject on nonexistent bucket returns NoSuchBucket', async () => {
    try {
      await expect(
        client.send(new GetObjectCommand({
          Bucket: 'nonexistent-bucket-xyz',
          Key: 'any-key',
        })),
      ).rejects.toThrow();

      await client.send(new GetObjectCommand({
        Bucket: 'nonexistent-bucket-xyz',
        Key: 'any-key',
      }));
    } catch (err: any) {
      expect(err.name).toBe('NoSuchBucket');
    }
  });

  test('PutBucketTagging persists tags from XML requests', async () => {
    const bucketName = `sdk-test-tags-${Date.now()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));

    await client.send(new PutBucketTaggingCommand({
      Bucket: bucketName,
      Tagging: {
        TagSet: [
          { Key: 'env', Value: 'dev' },
          { Key: 'team', Value: 'platform' },
        ],
      },
    }));

    const result = await client.send(new GetBucketTaggingCommand({ Bucket: bucketName }));
    expect(result.TagSet).toEqual([
      { Key: 'env', Value: 'dev' },
      { Key: 'team', Value: 'platform' },
    ]);

    await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
  });
});
