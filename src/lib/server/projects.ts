import { and, desc, eq } from 'drizzle-orm';

import type { AuthUser } from './auth';
import { db } from './db';
import { generationImages, generations, images, projects } from './db/schema';
import { Errors } from './errors';
import { newId } from './utils';

export const PROJECT_TYPES = ['ai', 'editor'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export type ProjectSummary = {
	id: string;
	type: string;
	name: string;
	status: string;
	coverImageId: string | null;
	coverUrl: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export type ProjectDetail = ProjectSummary & {
	generations: {
		id: string;
		status: string;
		images: { id: string; url: string }[];
		createdAt: Date;
	}[];
};

export type ProjectInput = {
	type?: string;
	name?: string;
	status?: string;
	coverImageId?: string | null;
};

async function requireOwnedProject(ownerId: string, projectId: string) {
	const rows = await db
		.select()
		.from(projects)
		.where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
		.limit(1);
	const row = rows[0];
	if (!row) throw Errors.notFound('Project not found.');
	return row;
}

async function requireOwnedImage(ownerId: string, imageId: string) {
	const rows = await db
		.select()
		.from(images)
		.where(and(eq(images.id, imageId), eq(images.ownerId, ownerId)))
		.limit(1);
	const row = rows[0];
	if (!row) throw Errors.notFound(`Image "${imageId}" was not found.`);
	return row;
}

async function coverUrlFor(coverImageId: string | null): Promise<string | null> {
	if (!coverImageId) return null;
	const rows = await db
		.select({ url: images.publicUrl })
		.from(images)
		.where(eq(images.id, coverImageId))
		.limit(1);
	return rows[0]?.url ?? null;
}

function toSummary(row: typeof projects.$inferSelect, coverUrl: string | null): ProjectSummary {
	return {
		id: row.id,
		type: row.type,
		name: row.name,
		status: row.status,
		coverImageId: row.coverImageId,
		coverUrl,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

/** List the user's projects, newest first. */
export async function listProjects(user: AuthUser): Promise<ProjectSummary[]> {
	const rows = await db
		.select()
		.from(projects)
		.where(eq(projects.ownerId, user.id))
		.orderBy(desc(projects.createdAt));
	return Promise.all(rows.map(async (row) => toSummary(row, await coverUrlFor(row.coverImageId))));
}

/** Fetch a single project with its generations and result images. */
export async function getProject(user: AuthUser, projectId: string): Promise<ProjectDetail> {
	const row = await requireOwnedProject(user.id, projectId);
	const coverUrl = await coverUrlFor(row.coverImageId);

	const gens = await db
		.select({
			id: generations.id,
			status: generations.status,
			createdAt: generations.createdAt
		})
		.from(generations)
		.where(eq(generations.projectId, projectId))
		.orderBy(desc(generations.createdAt));

	const detail: ProjectDetail = { ...toSummary(row, coverUrl), generations: [] };

	if (gens.length > 0) {
		const imageRows = await db
			.select({
				generationId: generationImages.generationId,
				imageId: images.id,
				url: images.publicUrl
			})
			.from(generationImages)
			.innerJoin(images, eq(generationImages.imageId, images.id))
			.innerJoin(generations, eq(generationImages.generationId, generations.id))
			.where(eq(generations.projectId, projectId));

		const byGeneration = new Map<string, { id: string; url: string }[]>();
		for (const img of imageRows) {
			const list = byGeneration.get(img.generationId) ?? [];
			list.push({ id: img.imageId, url: img.url });
			byGeneration.set(img.generationId, list);
		}

		detail.generations = gens.map((g) => ({
			id: g.id,
			status: g.status,
			images: byGeneration.get(g.id) ?? [],
			createdAt: g.createdAt
		}));
	}

	return detail;
}

/** Create a project. Requires type and name; coverImageId is optional. */
export async function createProject(user: AuthUser, input: ProjectInput): Promise<ProjectSummary> {
	if (!input.type || !PROJECT_TYPES.includes(input.type as ProjectType)) {
		throw Errors.invalidInput('Project type must be "ai" or "editor".');
	}
	const name = input.name?.trim();
	if (!name) throw Errors.invalidInput('A project name is required.');

	let coverImageId: string | null = null;
	if (input.coverImageId) {
		const img = await requireOwnedImage(user.id, input.coverImageId);
		coverImageId = img.id;
	}

	const inserted = await db
		.insert(projects)
		.values({
			id: newId('prj'),
			ownerId: user.id,
			type: input.type,
			name,
			status: input.status ?? 'active',
			coverImageId
		})
		.returning();
	const row = inserted[0];
	return toSummary(row, await coverUrlFor(row.coverImageId));
}

/** Update mutable project fields (name, status, cover image). */
export async function updateProject(
	user: AuthUser,
	projectId: string,
	input: ProjectInput
): Promise<ProjectSummary> {
	const row = await requireOwnedProject(user.id, projectId);

	const patch: Partial<typeof projects.$inferInsert> = {};
	if (input.name !== undefined) {
		const name = input.name.trim();
		if (!name) throw Errors.invalidInput('A project name is required.');
		patch.name = name;
	}
	if (input.status !== undefined) patch.status = input.status;
	if (input.coverImageId !== undefined) {
		if (input.coverImageId === null) {
			patch.coverImageId = null;
		} else {
			const img = await requireOwnedImage(user.id, input.coverImageId);
			patch.coverImageId = img.id;
		}
	}
	if (Object.keys(patch).length === 0) {
		return toSummary(row, await coverUrlFor(row.coverImageId));
	}

	patch.updatedAt = new Date();
	const updated = await db
		.update(projects)
		.set(patch)
		.where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)))
		.returning();
	return toSummary(updated[0], await coverUrlFor(updated[0].coverImageId));
}

/** Delete a project (cascades to its generations). */
export async function deleteProject(user: AuthUser, projectId: string): Promise<void> {
	await requireOwnedProject(user.id, projectId);
	await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)));
}

/** Duplicate a project's metadata (name + cover). Generations are not copied. */
export async function duplicateProject(user: AuthUser, projectId: string): Promise<ProjectSummary> {
	const row = await requireOwnedProject(user.id, projectId);
	const inserted = await db
		.insert(projects)
		.values({
			id: newId('prj'),
			ownerId: user.id,
			type: row.type,
			name: `${row.name} (Copy)`,
			status: row.status,
			coverImageId: row.coverImageId
		})
		.returning();
	const copy = inserted[0];
	return toSummary(copy, await coverUrlFor(copy.coverImageId));
}
