import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { requireUser } from '$lib/server/auth';
import { toSvelteError } from '$lib/server/errors';
import { createProject, listProjects } from '$lib/server/projects';
import { parseWithSchema } from '$lib/server/utils';

const createProjectSchema = z.object({
	type: z.enum(['ai', 'editor'], 'Project type must be "ai" or "editor".'),
	name: z.string().trim().min(1, 'A project name is required.'),
	status: z.string().min(1).optional(),
	coverImageId: z.string().min(1).optional()
});

export async function GET({ locals }) {
	try {
		const user = requireUser(locals);
		const projects = await listProjects(user);
		return json({ projects });
	} catch (err) {
		throw toSvelteError(err);
	}
}

export async function POST({ request, locals }) {
	try {
		const user = requireUser(locals);
		const input = parseWithSchema(createProjectSchema, await request.json());
		const project = await createProject(user, input);
		return json({ project }, { status: 201 });
	} catch (err) {
		throw toSvelteError(err);
	}
}
