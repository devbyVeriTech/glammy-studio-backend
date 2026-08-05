import { and, eq } from 'drizzle-orm';

import { aiProvider } from './ai';
import { buildCacheKey, normalizePrompt } from './ai/prompt';
import type { AuthUser } from './auth';
import { db } from './db';
import {
	generationImages,
	generations,
	images,
	projects,
	prompts,
	usage
} from './db/schema';
import { Errors } from './errors';
import { readImageInfo, sha256, storeImage } from './images';
import { storage } from './storage';
import { newId } from './utils';

export const BEAUTY_CATEGORIES = ['hair', 'makeup', 'nails', 'full-makeover'] as const;
export type BeautyCategory = (typeof BEAUTY_CATEGORIES)[number];

export type SubmitGenerationInput = {
	category: string;
	images: string[];
	prompt: string;
	count?: number;
	projectId?: string;
};

export type GenerationSummary = {
	id: string;
	status: 'processing' | 'succeeded' | 'failed';
	images: { id: string; url: string }[];
	errorCode: string | null;
	createdAt: Date;
};

/** Resolve an image id owned by the user to its DB row. */
async function requireImage(ownerId: string, imageId: string) {
	const rows = await db
		.select()
		.from(images)
		.where(and(eq(images.id, imageId), eq(images.ownerId, ownerId)))
		.limit(1);
	const row = rows[0];
	if (!row) throw Errors.notFound(`Image "${imageId}" was not found.`);
	return row;
}

async function findOrCreateProject(ownerId: string, category: string, prompt: string) {
	const existing = await db
		.select()
		.from(projects)
		.where(and(eq(projects.ownerId, ownerId), eq(projects.type, 'ai')))
		.orderBy(projects.createdAt)
		.limit(1);
	if (existing[0]) return existing[0];

	const name = `${category} ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
	const inserted = await db
		.insert(projects)
		.values({ id: newId('prj'), ownerId, type: 'ai', name })
		.returning();
	return inserted[0];
}

async function findOrCreatePrompt(ownerId: string, category: string, prompt: string) {
	const normalized = normalizePrompt(prompt);
	const existing = await db
		.select()
		.from(prompts)
		.where(and(eq(prompts.ownerId, ownerId), eq(prompts.normalizedText, normalized)))
		.limit(1);
	if (existing[0]) return existing[0];

	const inserted = await db
		.insert(prompts)
		.values({ id: newId('prm'), ownerId, text: prompt, category, normalizedText: normalized })
		.returning();
	return inserted[0];
}

async function findCachedGeneration(ownerId: string, cacheKey: string) {
	const rows = await db
		.select({ id: generations.id })
		.from(generations)
		.where(and(eq(generations.ownerId, ownerId), eq(generations.cacheKey, cacheKey), eq(generations.status, 'succeeded')))
		.orderBy(generations.createdAt)
		.limit(1);
	if (!rows[0]) return null;

	const linked = await db
		.select({ id: images.id, publicUrl: images.publicUrl })
		.from(generationImages)
		.innerJoin(images, eq(generationImages.imageId, images.id))
		.where(eq(generationImages.generationId, rows[0].id));
	return linked;
}

async function loadGenerationImages(generationId: string) {
	return db
		.select({ id: images.id, publicUrl: images.publicUrl })
		.from(generationImages)
		.innerJoin(images, eq(generationImages.imageId, images.id))
		.where(eq(generationImages.generationId, generationId));
}

/**
 * Submit an AI generation job. Returns immediately with the generation id;
 * processing continues in the background (poll via GET /ai/generation/:id).
 */
export async function submitGeneration(
	user: AuthUser,
	input: SubmitGenerationInput
): Promise<GenerationSummary> {
	const count = Math.min(Math.max(input.count ?? 1, 1), 4);

	const source = await requireImage(user.id, input.images[0]);
	const project = input.projectId
		? await requireProject(user.id, input.projectId)
		: await findOrCreateProject(user.id, input.category, input.prompt);
	const promptRow = await findOrCreatePrompt(user.id, input.category, input.prompt);

	const sourceBytes = await storage.read(source.storageKey);
	const sourceMime = `image/${source.format ?? 'png'}`;
	const sourceExtension = source.format === 'jpeg' ? 'jpg' : source.format ?? 'png';
	const normalized = normalizePrompt(input.prompt);
	const cacheKey = buildCacheKey(source.sha256, input.category, normalized, aiProvider.modelVersion);

	const cached = (await findCachedGeneration(user.id, cacheKey)) ?? [];
	if (cached.length >= count) {
		const generationId = newId('gen');
		await db.insert(generations).values({
			id: generationId,
			projectId: project.id,
			ownerId: user.id,
			cacheKey,
			promptId: promptRow.id,
			modelVersion: aiProvider.modelVersion,
			status: 'succeeded'
		});
		await db.insert(generationImages).values(
			cached.slice(0, count).map((img) => ({ generationId, imageId: img.id }))
		);
		await db.insert(usage).values({
			id: newId('use'),
			ownerId: user.id,
			operation: 'ai_generate_cache_hit',
			category: input.category,
			cost: 0
		});
		return summarize(generationId, 'succeeded', cached.slice(0, count));
	}

	const generationId = newId('gen');
	await db.insert(generations).values({
		id: generationId,
		projectId: project.id,
		ownerId: user.id,
		cacheKey,
		promptId: promptRow.id,
		modelVersion: aiProvider.modelVersion,
		status: 'processing'
	});

	// Fire-and-forget: runs to completion in the background.
	void runGeneration(
		generationId,
		user,
		input,
		sourceBytes,
		sourceMime,
		sourceExtension,
		count
	);

	return summarize(generationId, 'processing', []);
}

async function requireProject(ownerId: string, projectId: string) {
	const rows = await db
		.select()
		.from(projects)
		.where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
		.limit(1);
	const row = rows[0];
	if (!row) throw Errors.notFound('Project not found.');
	return row;
}

async function runGeneration(
	generationId: string,
	user: AuthUser,
	input: SubmitGenerationInput,
	sourceBytes: Buffer,
	sourceMime: string,
	sourceExtension: string,
	count: number
): Promise<void> {
	try {
		const results: { id: string; url: string }[] = [];
		for (let i = 0; i < count; i++) {
			const output = await aiProvider.generate({
				prompt: input.prompt,
				category: input.category,
				sourceImage: {
					buffer: sourceBytes,
					mimeType: sourceMime,
					extension: sourceExtension
				}
			});
			const { image } = await storeImage(user.id, {
				buffer: output.buffer,
				mimeType: output.mimeType,
				extension: output.extension,
				sha256: sha256(output.buffer),
				info: readImageInfo(output.buffer)
			});
			results.push({ id: image.id, url: image.publicUrl });
		}

		await db.transaction(async (tx) => {
			await tx
				.update(generations)
				.set({ status: 'succeeded', updatedAt: new Date() })
				.where(eq(generations.id, generationId));
			if (results.length > 0) {
				await tx.insert(generationImages).values(
					results.map((img) => ({ generationId, imageId: img.id }))
				);
			}
			await tx.insert(usage).values({
				id: newId('use'),
				ownerId: user.id,
				operation: 'ai_generate',
				category: input.category,
				cost: count
			});
		});
	} catch (err) {
		console.error(`[generation ${generationId}] failed:`, err);
		await db
			.update(generations)
			.set({ status: 'failed', errorCode: 'provider_error', updatedAt: new Date() })
			.where(eq(generations.id, generationId));
	}
}

/** Load a generation owned by the user for polling. */
export async function getGeneration(user: AuthUser, generationId: string): Promise<GenerationSummary> {
	const rows = await db
		.select()
		.from(generations)
		.where(and(eq(generations.id, generationId), eq(generations.ownerId, user.id)))
		.limit(1);
	const row = rows[0];
	if (!row) throw Errors.notFound('Generation not found.');

	const linked =
		row.status === 'succeeded' ? await loadGenerationImages(row.id) : [];
	return summarize(row.id, row.status as GenerationSummary['status'], linked, row.errorCode, row.createdAt);
}

function summarize(
	id: string,
	status: GenerationSummary['status'],
	linked: { id: string; publicUrl: string }[],
	errorCode: string | null = null,
	createdAt: Date = new Date()
): GenerationSummary {
	return {
		id,
		status,
		images: linked.map((img) => ({ id: img.id, url: img.publicUrl })),
		errorCode,
		createdAt
	};
}
