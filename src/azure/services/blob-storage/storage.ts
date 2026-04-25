import { resolve, dirname } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync, existsSync } from 'node:fs';
import { PersistentMap } from '../../../state/store.js';

const DATA_DIR = resolve('data/azure-blob');
const BLOCK_DIR = resolve('data/azure-blob-blocks');

export interface AzureBlobContainer {
  account: string;
  name: string;
  createdOn: string;
  metadata: Record<string, string>;
}

export interface AzureBlobMeta {
  account: string;
  container: string;
  name: string;
  contentType: string;
  etag: string;
  lastModified: string;
  size: number;
  metadata: Record<string, string>;
  committedBlockIds?: string[];
}

export interface AzureBlobObject extends AzureBlobMeta {
  body: Buffer;
}

interface BlockMeta {
  account: string;
  container: string;
  blob: string;
  blockId: string;
  size: number;
}

export const containers = new PersistentMap<string, AzureBlobContainer>('azure-blob-containers');
const blobs = new PersistentMap<string, AzureBlobMeta>('azure-blob-objects');
const blocks = new PersistentMap<string, BlockMeta>('azure-blob-blocks');

function containerKey(account: string, container: string): string {
  return `${account}\0${container}`;
}

function blobKey(account: string, container: string, blob: string): string {
  return `${account}\0${container}\0${blob}`;
}

function blockKey(account: string, container: string, blob: string, blockId: string): string {
  return `${account}\0${container}\0${blob}\0${blockId}`;
}

function blobBodyPath(account: string, container: string, blob: string): string {
  const suffix = blob.endsWith('/') ? blob + 'index' : blob;
  return resolve(DATA_DIR, account, container, suffix);
}

function blockBodyPath(account: string, container: string, blob: string, blockId: string): string {
  return resolve(BLOCK_DIR, account, container, blob, encodeURIComponent(blockId));
}

export function createContainer(account: string, name: string, metadata: Record<string, string>): AzureBlobContainer {
  const container: AzureBlobContainer = {
    account,
    name,
    createdOn: new Date().toISOString(),
    metadata,
  };
  containers.set(containerKey(account, name), container);
  return container;
}

export function getContainer(account: string, name: string): AzureBlobContainer | undefined {
  return containers.get(containerKey(account, name));
}

export function deleteContainer(account: string, name: string): boolean {
  const key = containerKey(account, name);
  if (!containers.has(key)) return false;
  containers.delete(key);

  const prefix = `${account}\0${name}\0`;
  for (const objectKey of Array.from(blobs.keys())) {
    if (objectKey.startsWith(prefix)) {
      const meta = blobs.get(objectKey)!;
      blobs.delete(objectKey);
      const path = blobBodyPath(account, name, meta.name);
      if (existsSync(path)) unlinkSync(path);
    }
  }

  const containerDir = resolve(DATA_DIR, account, name);
  if (existsSync(containerDir)) rmSync(containerDir, { recursive: true });
  return true;
}

export function listContainers(account: string): AzureBlobContainer[] {
  return Array.from(containers.values()).filter((container) => container.account === account);
}

export function putBlob(
  account: string,
  container: string,
  name: string,
  body: Buffer,
  opts: Omit<AzureBlobMeta, 'account' | 'container' | 'name' | 'size'>,
): AzureBlobMeta {
  const path = blobBodyPath(account, container, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  const meta: AzureBlobMeta = { account, container, name, size: body.length, ...opts };
  blobs.set(blobKey(account, container, name), meta);
  return meta;
}

export function getBlob(account: string, container: string, name: string): AzureBlobObject | undefined {
  const meta = blobs.get(blobKey(account, container, name));
  if (!meta) return undefined;
  const path = blobBodyPath(account, container, name);
  if (!existsSync(path)) return undefined;
  return { ...meta, body: readFileSync(path) };
}

export function getBlobMeta(account: string, container: string, name: string): AzureBlobMeta | undefined {
  return blobs.get(blobKey(account, container, name));
}

export function deleteBlob(account: string, container: string, name: string): boolean {
  const key = blobKey(account, container, name);
  if (!blobs.has(key)) return false;
  blobs.delete(key);
  const path = blobBodyPath(account, container, name);
  if (existsSync(path)) unlinkSync(path);
  return true;
}

export function listBlobs(account: string, container: string, prefix = ''): AzureBlobMeta[] {
  return Array.from(blobs.values())
    .filter((blob) => blob.account === account && blob.container === container && blob.name.startsWith(prefix))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function putBlock(account: string, container: string, blob: string, blockId: string, body: Buffer): void {
  const path = blockBodyPath(account, container, blob, blockId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  blocks.set(blockKey(account, container, blob, blockId), {
    account,
    container,
    blob,
    blockId,
    size: body.length,
  });
}

export function getBlock(account: string, container: string, blob: string, blockId: string): Buffer | undefined {
  if (!blocks.has(blockKey(account, container, blob, blockId))) return undefined;
  const path = blockBodyPath(account, container, blob, blockId);
  if (!existsSync(path)) return undefined;
  return readFileSync(path);
}

export function listUncommittedBlocks(account: string, container: string, blob: string): BlockMeta[] {
  return Array.from(blocks.values())
    .filter((block) => block.account === account && block.container === container && block.blob === blob);
}

export function deleteUncommittedBlocks(account: string, container: string, blob: string): void {
  for (const block of listUncommittedBlocks(account, container, blob)) {
    blocks.delete(blockKey(account, container, blob, block.blockId));
    const path = blockBodyPath(account, container, blob, block.blockId);
    if (existsSync(path)) unlinkSync(path);
  }
}

export function clearAzureBlobStorage(): void {
  containers.clear();
  blobs.clear();
  blocks.clear();
  if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true });
  if (existsSync(BLOCK_DIR)) rmSync(BLOCK_DIR, { recursive: true });
}
