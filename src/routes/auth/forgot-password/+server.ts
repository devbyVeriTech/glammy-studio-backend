import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { findUserByEmail, signPasswordResetToken } from '$lib/server/auth';
import { sendPasswordResetEmail } from '$lib/server/email';
import { toSvelteError } from '$lib/server/errors';
import { parseWithSchema } from '$lib/server/utils';
import { env } from '$env/dynamic/private';

const forgotPasswordSchema = z.object({
	email: z.email('A valid email address is required.')
});

export async function POST({ request }) {
	try {
		const input = parseWithSchema(forgotPasswordSchema, await request.json());
		const user = await findUserByEmail(input.email);

		// Always respond identically to avoid user enumeration.
		if (user) {
			const token = signPasswordResetToken(user.id);
			const baseUrl = env.PUBLIC_API_URL ?? 'http://localhost:3000';
			await sendPasswordResetEmail({
				to: user.email,
				resetLink: `${baseUrl}/auth/reset-password?token=${encodeURIComponent(token)}`
			});
		}

		return json({ success: true });
	} catch (err) {
		throw toSvelteError(err);
	}
}
