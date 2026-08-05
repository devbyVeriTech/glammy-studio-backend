import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { findUserByEmail, issueTokenPair, verifyPassword } from '$lib/server/auth';
import { Errors, toSvelteError } from '$lib/server/errors';
import { parseWithSchema } from '$lib/server/utils';

const signInSchema = z.object({
	email: z.email('A valid email address is required.'),
	password: z.string().min(1, 'Password is required.')
});

export async function POST({ request }) {
	try {
		const input = parseWithSchema(signInSchema, await request.json());
		const user = await findUserByEmail(input.email);

		if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
			throw Errors.unauthorized('Invalid email or password.');
		}

		const authUser = { id: user.id, email: user.email, role: user.role };
		const { pair, tokenId } = await issueTokenPair(authUser);

		return json({
			user: { id: authUser.id, email: authUser.email, fullName: user.fullName },
			tokens: { ...pair, refreshTokenId: tokenId }
		});
	} catch (err) {
		throw toSvelteError(err);
	}
}
