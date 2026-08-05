import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { createUser, hashPassword, issueTokenPair } from '$lib/server/auth';
import { toSvelteError } from '$lib/server/errors';
import { parseWithSchema } from '$lib/server/utils';

const signUpSchema = z.object({
	email: z.email('A valid email address is required.'),
	password: z.string().min(8, 'Password must be at least 8 characters long.'),
	fullName: z.string().trim().min(1, 'Full name is required.').optional()
});

export async function POST({ request }) {
	try {
		const input = parseWithSchema(signUpSchema, await request.json());
		const passwordHash = await hashPassword(input.password);
		const user = await createUser(input.email, passwordHash, input.fullName);

		const authUser = { id: user.id, email: user.email, role: user.role };
		const { pair, tokenId } = await issueTokenPair(authUser);

		return json(
			{
				user: { id: authUser.id, email: authUser.email, fullName: user.fullName },
				tokens: { ...pair, refreshTokenId: tokenId }
			},
			{ status: 201 }
		);
	} catch (err) {
		throw toSvelteError(err);
	}
}
