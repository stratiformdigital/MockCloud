import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/state');

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { __mapEntries: [...value.entries()] };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '__mapEntries' in value) {
    return new Map((value as { __mapEntries: [string, unknown][] }).__mapEntries);
  }
  return value;
}

const allMaps = new Set<PersistentMap<string, unknown>>();

export class PersistentMap<K extends string, V> extends Map<K, V> {
  private filePath: string;
  private name: string;
  private loaded = false;

  constructor(name: string) {
    super();
    this.name = name;
    this.filePath = path.join(dataDir, `${name}.json`);
    allMaps.add(this as unknown as PersistentMap<string, unknown>);
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (fs.existsSync(this.filePath)) {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'), reviver);
      for (const [k, v] of Object.entries(data)) {
        super.set(k as K, v as V);
      }
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const obj: Record<string, V> = {};
    for (const [k, v] of super.entries()) {
      obj[k as string] = v;
    }
    fs.writeFileSync(this.filePath, JSON.stringify(obj, replacer, 2));
  }

  get(key: K): V | undefined {
    this.ensureLoaded();
    return super.get(key);
  }

  has(key: K): boolean {
    this.ensureLoaded();
    return super.has(key);
  }

  set(key: K, value: V): this {
    this.ensureLoaded();
    super.set(key, value);
    this.persist();
    return this;
  }

  delete(key: K): boolean {
    this.ensureLoaded();
    const result = super.delete(key);
    if (result) this.persist();
    return result;
  }

  clear(): void {
    super.clear();
    this.loaded = true;
    if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
  }

  get size(): number {
    this.ensureLoaded();
    return super.size;
  }

  entries(): MapIterator<[K, V]> {
    this.ensureLoaded();
    return super.entries();
  }

  keys(): MapIterator<K> {
    this.ensureLoaded();
    return super.keys();
  }

  values(): MapIterator<V> {
    this.ensureLoaded();
    return super.values();
  }

  forEach(cb: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    this.ensureLoaded();
    super.forEach(cb, thisArg);
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    this.ensureLoaded();
    return super[Symbol.iterator]();
  }
}

export async function clearAllState(): Promise<void> {
  fs.rmSync(dataDir, { recursive: true, force: true });
  for (const m of allMaps) {
    m.clear();
  }
  allMaps.clear();
  const { clearS3Storage } = await import('../services/s3/storage.js');
  clearS3Storage();
  const { clearAzureBlobStorage } = await import('../azure/services/blob-storage/storage.js');
  clearAzureBlobStorage();
}
