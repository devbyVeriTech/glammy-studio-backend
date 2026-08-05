import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { requireUser } from '$lib/server/auth';
import { Errors, toSvelteError } from '$lib/server/errors';
import { BEAUTY_CATEGORIES, submitGeneration } from '$lib/server/generation';
import { createRateLimiter } from '$lib/server/rate-limit';
import { parseWithSchema } from '$lib/server/utils';

const generateSchema = z.object({
	category: z.enum(BEAUTY_CATEGORIES, 'Choose a valid beauty category.'),
	images: z.array(z.string().min(1)).min(1, 'At least one image is required.'),
	prompt: z.string().trim().min(3, 'A prompt of at least 3 characters is required.'),
	count: z.number().int().min(1).max(4).optional(),
	projectId: z.string().min(1).optional()
});

const generateRateLimiter = createRateLimiter(5, 60 * 1000);

export async function POST({ request, locals }) {
	try {
		const user = requireUser(locals);
		await generateRateLimiter.check('ai', user.id);

		const input = parseWithSchema(generateSchema, await request.json());
		const generation = await submitGeneration(user, input);

		return json(
			{
				id: generation.id,
				status: generation.status,
				images: generation.images,
				errorCode: generation.errorCode
			},
			{ status: 202 }
		);
	} catch (err) {
		throw toSvelteError(err);
	}
}
