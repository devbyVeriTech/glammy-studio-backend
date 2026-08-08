import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { findUserById, hashPassword, requireUser, verifyPassword } from '$lib/server/auth';
import { Errors, toSvelteError } from '$lib/server/errors';
import { parseWithSchema } from '$lib/server/utils';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

const changePasswordSchema = z.object({
	currentPassword: z.string().min(1, 'Current password is required.'),
	newPassword: z.string().min(8, 'Password must be at least 8 characters long.')
});

export async function POST({ request, locals }) {
	try {
		const authUser = requireUser(locals);
		const input = parseWithSchema(changePasswordSchema, await request.json());

		const row = await findUserById(authUser.id);
		if (!row) throw Errors.unauthorized('Account no longer exists.');

		const matches = await verifyPassword(input.currentPassword, row.passwordHash);
		if (!matches) throw Errors.invalidInput('Your current password is incorrect.');

		const passwordHash = await hashPassword(input.newPassword);
		await db
			.update(users)
			.set({ passwordHash, updatedAt: new Date() })
			.where(eq(users.id, authUser.id));

		return json({ success: true });
	} catch (err) {
		throw toSvelteError(err);
	}
}
