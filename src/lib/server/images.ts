import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db } from './db';
import { images } from './db/schema';
import { Errors } from './errors';
import { storage } from './storage';
import { newId } from './utils';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

const MIME_EXTENSION: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/heic': 'heic',
	'image/heif': 'heif',
	'image/gif': 'gif'
};

export type ImageInfo = {
	width: number | null;
	height: number | null;
	format: string;
};

export type ValidatedImage = {
	buffer: Buffer;
	mimeType: string;
	extension: string;
	sha256: string;
	info: ImageInfo;
};

export function sha256(buffer: Buffer): string {
	return createHash('sha256').update(buffer).digest('hex');
}

export function supportedMimeType(mimeType: string | null): boolean {
	return !!mimeType && mimeType in MIME_EXTENSION;
}

/** Read image dimensions from magic bytes for common formats. */
export function readImageInfo(buffer: Buffer): ImageInfo {
	// PNG: bytes 16-23 = width (BE) then height (BE)
	if (buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47) {
		return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' };
	}

	// JPEG: scan markers for SOFn (0xFFC0-0xFFC3, 0xFFC5-0xFFC7, ...)
	if (buffer.length >= 4 && buffer.readUInt16BE(0) === 0xffd8) {
		let offset = 2;
		while (offset + 9 < buffer.length) {
			if (buffer[offset] !== 0xff) {
				offset += 1;
				continue;
			}
			const marker = buffer[offset + 1];
			if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
				const height = buffer.readUInt16BE(offset + 5);
				const width = buffer.readUInt16BE(offset + 7);
				return { width, height, format: 'jpeg' };
			}
			const length = buffer.readUInt16BE(offset + 2);
			offset += 2 + length;
		}
		return { width: null, height: null, format: 'jpeg' };
	}

	// GIF: bytes 6-9 (LE)
	if (buffer.length >= 10 && buffer.toString('ascii', 0, 3) === 'GIF') {
		return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8), format: 'gif' };
	}

	// WebP: RIFF....WEBP
	if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF') {
		if (buffer.toString('ascii', 8, 12) === 'WEBP') {
			const format = buffer.toString('ascii', 12, 16);
			if (format === 'VP8X') {
				const width = 1 + buffer.readUIntLE(24, 3);
				const height = 1 + buffer.readUIntLE(27, 3);
				return { width, height, format: 'webp' };
			}
			if (format === 'VP8L') {
				const bits = buffer.readUInt32LE(21);
				return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, format: 'webp' };
			}
			return { width: buffer.readUInt16LE(26), height: buffer.readUInt16LE(28), format: 'webp' };
		}
	}

	return { width: null, height: null, format: 'unknown' };
}

/** Detect the actual image format from magic bytes, or null when not an image. */
export function detectFormat(buffer: Buffer): string | null {
	if (buffer.length >= 8 && buffer.readUInt32BE(0) === 0x89504e47) return 'png';
	if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
		return 'jpeg';
	}
	if (buffer.length >= 6 && buffer.toString('ascii', 0, 3) === 'GIF') return 'gif';
	if (
		buffer.length >= 12 &&
		buffer.toString('ascii', 0, 4) === 'RIFF' &&
		buffer.toString('ascii', 8, 12) === 'WEBP'
	) {
		return 'webp';
	}
	// ISO BMFF (HEIC/HEIF): bytes 4-8 are 'ftyp' and the brand follows.
	if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
		const brand = buffer.toString('ascii', 8, 12);
		if (brand === 'heic' || brand === 'heif' || brand === 'mif1' || brand === 'msf1') {
			return 'heic';
		}
	}
	return null;
}

/** Validate an uploaded file buffer, returning normalized metadata. */
export function validateImageBuffer(buffer: Buffer, mimeType: string | null): ValidatedImage {
	if (buffer.length === 0) throw Errors.invalidInput('The uploaded file is empty.');
	if (buffer.length > MAX_FILE_SIZE) {
		throw Errors.invalidInput('The uploaded file is larger than 15 MB.');
	}
	if (!supportedMimeType(mimeType)) {
		throw Errors.invalidInput('Unsupported file type. Use JPEG, PNG, WEBP, GIF, HEIC, or HEIF.');
	}
	const actualFormat = detectFormat(buffer);
	if (!actualFormat) {
		throw Errors.invalidInput('The uploaded file does not appear to be a valid image.');
	}
	return {
		buffer,
		mimeType: mimeType as string,
		extension: MIME_EXTENSION[mimeType as string],
		sha256: sha256(buffer),
		info: readImageInfo(buffer)
	};
}

/**
 * Store an image, reusing the existing record/asset when the exact bytes
 * (by SHA-256) were already uploaded by this user.
 */
export async function storeImage(
	ownerId: string,
	validated: ValidatedImage
): Promise<{ image: typeof images.$inferSelect; created: boolean }> {
	const existing = await db
		.select()
		.from(images)
		.where(eq(images.sha256, validated.sha256))
		.limit(1);
	if (existing[0]) {
		return { image: existing[0], created: false };
	}

	const stored = await storage.upload({
		buffer: validated.buffer,
		mimeType: validated.mimeType,
		extension: validated.extension
	});

	const image = {
		id: newId('img'),
		ownerId,
		sha256: validated.sha256,
		storageKey: stored.storageKey,
		publicUrl: stored.publicUrl,
		width: validated.info.width,
		height: validated.info.height,
		format: validated.info.format === 'unknown' ? validated.extension : validated.info.format,
		fileSize: validated.buffer.length
	};
	const inserted = await db.insert(images).values(image).returning();

	return { image: inserted[0], created: true };
}
