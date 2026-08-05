export type StoredFile = {
	storageKey: string;
	publicUrl: string;
};

export type UploadInput = {
	buffer: Buffer;
	mimeType: string;
	extension: string;
};

export interface StorageDriver {
	/** Persist a buffer and return a storage key + public URL. */
	upload(input: UploadInput): Promise<StoredFile>;
	/** Build a public URL for an existing storage key. */
	getPublicUrl(storageKey: string): string;
	/** Read back the raw bytes for a storage key. */
	read(storageKey: string): Promise<Buffer>;
	/** Delete an object by storage key. Best-effort; throws on failure. */
	delete(storageKey: string): Promise<void>;
}
