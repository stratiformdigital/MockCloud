import { describe, expect, test } from 'vitest';
import { createBlobServiceClient } from './azure-client-factory.js';

async function streamToBuffer(stream: NodeJS.ReadableStream | undefined): Promise<Buffer> {
  if (!stream) throw new Error('No stream');
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('Azure Blob Storage', () => {
  const client = createBlobServiceClient();

  test('container and blob lifecycle', async () => {
    const containerName = `azcontainer${Date.now()}`;
    const container = client.getContainerClient(containerName);

    await container.create();

    const containers: string[] = [];
    for await (const item of client.listContainers()) {
      containers.push(item.name);
    }
    expect(containers).toContain(containerName);

    const blob = container.getBlockBlobClient('dir/hello.txt');
    await blob.upload('hello azure', Buffer.byteLength('hello azure'), {
      blobHTTPHeaders: { blobContentType: 'text/plain' },
      metadata: { env: 'test' },
    });

    const downloaded = await blob.download();
    expect(await streamToBuffer(downloaded.readableStreamBody)).toEqual(Buffer.from('hello azure'));

    const properties = await blob.getProperties();
    expect(properties.contentType).toBe('text/plain');
    expect(properties.metadata?.env).toBe('test');

    const names: string[] = [];
    for await (const item of container.listBlobsFlat()) {
      names.push(item.name);
    }
    expect(names).toContain('dir/hello.txt');

    await blob.delete();
    await container.delete();
  });

  test('block blob staging and commit', async () => {
    const containerName = `azblocks${Date.now()}`;
    const container = client.getContainerClient(containerName);
    await container.create();

    const blob = container.getBlockBlobClient('blocks.bin');
    const first = Buffer.from('hello ');
    const second = Buffer.from('blocks');
    const firstId = Buffer.from('first').toString('base64');
    const secondId = Buffer.from('second').toString('base64');

    await blob.stageBlock(firstId, first, first.length);
    await blob.stageBlock(secondId, second, second.length);
    await blob.commitBlockList([firstId, secondId]);

    const downloaded = await blob.download();
    expect(await streamToBuffer(downloaded.readableStreamBody)).toEqual(Buffer.from('hello blocks'));

    await blob.delete();
    await container.delete();
  });

  test('range request returns 206 with Content-Range and sliced body', async () => {
    const containerName = `azrange${Date.now()}`;
    const container = client.getContainerClient(containerName);
    await container.create();

    const blobName = 'range-target.txt';
    const blob = container.getBlockBlobClient(blobName);
    const payload = Buffer.from('abcdefghijklmnopqrstuvwxyz');
    await blob.upload(payload, payload.length);

    const download = await blob.download(5, 10);
    expect(download._response.status).toBe(206);
    const contentRange = download._response.headers.get('content-range');
    expect(contentRange).toBe(`bytes 5-14/${payload.length}`);
    const body = await streamToBuffer(download.readableStreamBody);
    expect(body.toString()).toBe('fghijklmno');

    await blob.delete();
    await container.delete();
  });
});
