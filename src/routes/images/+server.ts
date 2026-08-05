import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/auth';
import { toSvelteError } from '$lib/server/errors';
import { storeImage, validateImageBuffer } from '$lib/server/images';

export async function POST({ request, locals }) {
	try {
		const user = requireUser(locals);
		const formData = await request.formData();
		const file = formData.get('file');

		if (!(file instanceof File)) {
			return json(
				{ code: 'invalid_input', message: 'A "file" field with image data is required.', retryable: false },
				{ status: 400 }
			);
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		const validated = validateImageBuffer(buffer, file.type);
		const { image, created } = await storeImage(user.id, validated);

		return json(
			{
				id: image.id,
				url: image.publicUrl,
				width: image.width,
				height: image.height,
				format: image.format,
				sha256: image.sha256,
				created
			},
			{ status: created ? 201 : 200 }
		);
	} catch (err) {
		throw toSvelteError(err);
	}
}
