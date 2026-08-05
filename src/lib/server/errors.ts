import { error } from '@sveltejs/kit';
import type { ZodError } from 'zod';

export type ErrorBody = {
	code: string;
	message: string;
	retryable: boolean;
};

export class ApiError extends Error {
	status: number;
	code: string;
	retryable: boolean;

	constructor(status: number, code: string, message: string, retryable = false) {
		super(message);
		this.status = status;
		this.code = code;
		this.retryable = retryable;
	}
}

export const Errors = {
	invalidInput: (message = 'Invalid input.') =>
		new ApiError(400, 'invalid_input', message, false),
	unauthorized: (message = 'Authentication required.') =>
		new ApiError(401, 'unauthorized', message, false),
	forbidden: (message = 'You do not have permission to perform this action.') =>
		new ApiError(403, 'forbidden', message, false),
	notFound: (message = 'Resource not found.') => new ApiError(404, 'not_found', message, false),
	conflict: (message = 'Resource already exists.') =>
		new ApiError(409, 'conflict', message, false),
	rateLimited: (message = 'Too many requests. Please try again later.') =>
		new ApiError(429, 'rate_limited', message, true),
	provider: (message = 'The AI provider could not complete the request.') =>
		new ApiError(502, 'provider_error', message, true),
	internal: (message = 'Something went wrong.') =>
		new ApiError(500, 'internal_error', message, true)
};

/** Throw an ApiError from a Zod parse failure. */
export function zodIssueToApiError(zodError: ZodError): ApiError {
	const first = zodError.issues[0];
	const message = first ? first.message : 'Invalid input.';
	return Errors.invalidInput(message);
}

/** SvelteKit error factory so handleError can normalize responses. */
export function toSvelteError(err: unknown): never {
	if (err instanceof ApiError) {
		return error(err.status, { code: err.code, message: err.message, retryable: err.retryable });
	}
	return error(500, { code: 'internal_error', message: 'Something went wrong.', retryable: true });
}
