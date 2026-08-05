import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/auth';
import { toSvelteError } from '$lib/server/errors';

export async function GET({ locals }) {
	try {
		const user = requireUser(locals);
		return json({ user });
	} catch (err) {
		throw toSvelteError(err);
	}
}
