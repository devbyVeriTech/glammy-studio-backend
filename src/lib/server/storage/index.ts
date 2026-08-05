import { env } from '$env/dynamic/private';

import { CloudinaryStorageDriver } from './cloudinary';
import { LocalDiskStorageDriver } from './local-disk';
import type { StorageDriver } from './driver';

const globalForStorage = globalThis as unknown as { __glammyStorage?: StorageDriver };

function createStorageDriver(): StorageDriver {
	if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
		return new CloudinaryStorageDriver();
	}
	return new LocalDiskStorageDriver();
}

export const storage: StorageDriver = globalForStorage.__glammyStorage ?? createStorageDriver();

if (process.env.NODE_ENV !== 'production') {
	globalForStorage.__glammyStorage = storage;
}
