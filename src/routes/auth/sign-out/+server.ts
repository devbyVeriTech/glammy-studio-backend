import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { revokeRefreshToken } from '$lib/server/auth';
import { toSvelteError } from '$lib/server/errors';
import { parseWithSchema } from '$lib/server/utils';

const signOutSchema = z.object({
	refreshToken: z.string().min(1, 'refreshToken is required.')
});

export async function POST({ request }) {
	try {
		const input = parseWithSchema(signOutSchema, await request.json());
		await revokeRefreshToken(input.refreshToken);
		return json({ success: true });
	} catch (err) {
		throw toSvelteError(err);
	}
}
