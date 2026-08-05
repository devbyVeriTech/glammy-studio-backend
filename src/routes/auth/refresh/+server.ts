import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { rotateRefreshToken } from '$lib/server/auth';
import { toSvelteError } from '$lib/server/errors';
import { parseWithSchema } from '$lib/server/utils';

const refreshSchema = z.object({
	refreshToken: z.string().min(1, 'refreshToken is required.')
});

export async function POST({ request }) {
	try {
		const input = parseWithSchema(refreshSchema, await request.json());
		const rotated = await rotateRefreshToken(input.refreshToken);

		if (!rotated) {
			return json(
				{ code: 'invalid_refresh_token', message: 'The refresh token is invalid or expired.', retryable: false },
				{ status: 401 }
			);
		}

		return json({
			user: { id: rotated.user.id, email: rotated.user.email, role: rotated.user.role },
			tokens: { ...rotated.pair, refreshTokenId: rotated.tokenId }
		});
	} catch (err) {
		throw toSvelteError(err);
	}
}
