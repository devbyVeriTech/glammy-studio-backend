import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/auth';
import { toSvelteError } from '$lib/server/errors';
import { getGeneration } from '$lib/server/generation';

export async function GET({ params, locals }) {
	try {
		const user = requireUser(locals);
		const generation = await getGeneration(user, params.id);

		return json({
			id: generation.id,
			status: generation.status,
			images: generation.images,
			errorCode: generation.errorCode,
			createdAt: generation.createdAt
		});
	} catch (err) {
		throw toSvelteError(err);
	}
}
