import { createHash } from 'node:crypto';

/** Trim, lowercase, and collapse whitespace so equal prompts share a cache key. */
export function normalizePrompt(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.replace(/[.,!?;:]+$/g, '')
		.trim();
}

/**
 * Build a deterministic generation cache key from the exact source bytes,
 * category, normalized prompt, and provider model version.
 */
export function buildCacheKey(
	sourceSha256: string,
	category: string,
	normalizedPrompt: string,
	modelVersion: string
): string {
	return createHash('sha256')
		.update(sourceSha256)
		.update('\u0000')
		.update(category)
		.update('\u0000')
		.update(normalizedPrompt)
		.update('\u0000')
		.update(modelVersion)
		.digest('hex');
}
