import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';

import { newId } from '../utils';
import type { StorageDriver, StoredFile, UploadInput } from './driver';

export class LocalDiskStorageDriver implements StorageDriver {
	private readonly dir: string;
	private readonly publicBase: string;

	constructor(options?: { dir?: string; publicBase?: string }) {
		this.dir = path.resolve(options?.dir ?? env.STORAGE_UPLOAD_DIR ?? 'uploads');
		this.publicBase = (options?.publicBase ?? env.PUBLIC_API_URL ?? 'http://localhost:3000').replace(
			/\/$/,
			''
		);
	}

	async upload(input: UploadInput): Promise<StoredFile> {
		await mkdir(this.dir, { recursive: true });
		const storageKey = `${newId('img')}.${input.extension}`;
		await writeFile(path.join(this.dir, storageKey), input.buffer);
		return { storageKey, publicUrl: this.getPublicUrl(storageKey) };
	}

	getPublicUrl(storageKey: string): string {
		return `${this.publicBase}/uploads/${storageKey}`;
	}

	async read(storageKey: string): Promise<Buffer> {
		return readFile(path.join(this.dir, storageKey));
	}

	async delete(storageKey: string): Promise<void> {
		try {
			await unlink(path.join(this.dir, storageKey));
		} catch {
			// Missing files are treated as already deleted.
		}
	}
}
