import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { findUserById, requireUser } from '$lib/server/auth';
import { Errors, toSvelteError } from '$lib/server/errors';
import { parseWithSchema } from '$lib/server/utils';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

const updateProfileSchema = z.object({
	fullName: z.string().trim().min(1, 'Full name is required.')
});

function toUser(user: { id: string; email: string; role: string; fullName: string | null }) {
	return { id: user.id, email: user.email, role: user.role, fullName: user.fullName };
}

export async function GET({ locals }) {
	try {
		const authUser = requireUser(locals);
		const row = await findUserById(authUser.id);
		return json({ user: toUser(row ?? { ...authUser, fullName: null }) });
	} catch (err) {
		throw toSvelteError(err);
	}
}

export async function PATCH({ request, locals }) {
	try {
		const authUser = requireUser(locals);
		const input = parseWithSchema(updateProfileSchema, await request.json());

		const row = await findUserById(authUser.id);
		if (!row) throw Errors.unauthorized('Account no longer exists.');

		const updated = await db
			.update(users)
			.set({ fullName: input.fullName, updatedAt: new Date() })
			.where(eq(users.id, authUser.id))
			.returning();

		return json({ user: toUser(updated[0]) });
	} catch (err) {
		throw toSvelteError(err);
	}
}
