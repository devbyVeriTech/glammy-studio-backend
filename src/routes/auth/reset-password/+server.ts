import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { findUserById, hashPassword, verifyPasswordResetToken } from '$lib/server/auth';
import { Errors, toSvelteError } from '$lib/server/errors';
import { parseWithSchema } from '$lib/server/utils';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const resetPasswordSchema = z.object({
	token: z.string().min(1, 'token is required.'),
	password: z.string().min(8, 'Password must be at least 8 characters long.')
});

export async function POST({ request }) {
	try {
		const input = parseWithSchema(resetPasswordSchema, await request.json());
		const userId = verifyPasswordResetToken(input.token);

		if (!userId) {
			throw Errors.invalidInput('The reset token is invalid or has expired.');
		}

		const user = await findUserById(userId);
		if (!user) throw Errors.notFound('Account not found.');

		const passwordHash = await hashPassword(input.password);
		await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

		return json({ success: true });
	} catch (err) {
		throw toSvelteError(err);
	}
}
