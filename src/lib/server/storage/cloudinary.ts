import { v2 as cloudinary } from 'cloudinary';
import { env } from '$env/dynamic/private';

import type { StorageDriver, StoredFile, UploadInput } from './driver';

export class CloudinaryStorageDriver implements StorageDriver {
	constructor() {
		if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
			throw new Error('Cloudinary credentials are not set.');
		}
		cloudinary.config({
			cloud_name: env.CLOUDINARY_CLOUD_NAME,
			api_key: env.CLOUDINARY_API_KEY,
			api_secret: env.CLOUDINARY_API_SECRET
		});
	}

	upload(input: UploadInput): Promise<StoredFile> {
		return new Promise((resolve, reject) => {
			const stream = cloudinary.uploader.upload_stream(
				{
					folder: 'glammy',
					resource_type: 'image',
					format: input.extension === 'heic' ? 'jpg' : undefined
				},
				(error, result) => {
					if (error || !result) return reject(error ?? new Error('Cloudinary upload failed.'));
					resolve({
						storageKey: result.public_id,
						publicUrl: result.secure_url
					});
				}
			);
			stream.end(input.buffer);
		});
	}

	getPublicUrl(storageKey: string): string {
		return cloudinary.url(storageKey, { secure: true });
	}

	async read(storageKey: string): Promise<Buffer> {
		const response = await fetch(this.getPublicUrl(storageKey));
		if (!response.ok) {
			throw new Error(`Failed to read Cloudinary object: ${response.status}`);
		}
		return Buffer.from(await response.arrayBuffer());
	}

	async delete(storageKey: string): Promise<void> {
		await new Promise((resolve, reject) => {
			cloudinary.uploader.destroy(storageKey, (error, result) => {
				if (error) return reject(error);
				if (result?.result !== 'ok' && result?.result !== 'not found') {
					return reject(new Error(`Cloudinary delete failed: ${result?.result}`));
				}
				resolve(null);
			});
		});
	}
}
