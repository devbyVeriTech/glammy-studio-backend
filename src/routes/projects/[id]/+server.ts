import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { requireUser } from '$lib/server/auth';
import { toSvelteError } from '$lib/server/errors';
import { deleteProject, getProject, updateProject } from '$lib/server/projects';
import { parseWithSchema } from '$lib/server/utils';

const updateProjectSchema = z.object({
	name: z.string().trim().min(1, 'A project name is required.').optional(),
	status: z.string().min(1).optional(),
	coverImageId: z.string().min(1).nullable().optional()
});

export async function GET({ params, locals }) {
	try {
		const user = requireUser(locals);
		const project = await getProject(user, params.id);
		return json({ project });
	} catch (err) {
		throw toSvelteError(err);
	}
}

export async function PATCH({ params, request, locals }) {
	try {
		const user = requireUser(locals);
		const input = parseWithSchema(updateProjectSchema, await request.json());
		const project = await updateProject(user, params.id, input);
		return json({ project });
	} catch (err) {
		throw toSvelteError(err);
	}
}

export async function DELETE({ params, locals }) {
	try {
		const user = requireUser(locals);
		await deleteProject(user, params.id);
		return json({ deleted: true });
	} catch (err) {
		throw toSvelteError(err);
	}
}
