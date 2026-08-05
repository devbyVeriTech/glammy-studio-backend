import { customAlphabet } from 'nanoid';
import { Errors, zodIssueToApiError } from './errors';
import type { ZodType } from 'zod';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';

export const newId = (prefix: string, length = 21) =>
	`${prefix}_${customAlphabet(alphabet, length)()}`;

/** Parse a JSON request body, throwing a 400 on malformed JSON. */
export async function parseJsonBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw Errors.invalidInput('Request body must be valid JSON.');
	}
}

/** Validate unknown data against a Zod schema. Throws a 400 on failure. */
export function parseWithSchema<T>(schema: ZodType<T>, data: unknown): T {
	const result = schema.safeParse(data);
	if (!result.success) {
		throw zodIssueToApiError(result.error);
	}
	return result.data;
}
