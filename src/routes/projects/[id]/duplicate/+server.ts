import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/auth';
import { toSvelteError } from '$lib/server/errors';
import { duplicateProject } from '$lib/server/projects';

export async function POST({ params, locals }) {
	try {
		const user = requireUser(locals);
		const project = await duplicateProject(user, params.id);
		return json({ project }, { status: 201 });
	} catch (err) {
		throw toSvelteError(err);
	}
}
