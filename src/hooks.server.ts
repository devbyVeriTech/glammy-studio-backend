import type { Handle, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

import { extractBearerToken, verifyAccessToken } from '$lib/server/auth';

/** Attach the authenticated user (if any) to locals. */
const auth: Handle = async ({ event, resolve }) => {
	const authorization = event.request.headers.get('authorization');
	const token = extractBearerToken(authorization);
	event.locals.user = token ? verifyAccessToken(token) : null;
	return resolve(event);
};

const logging: Handle = async ({ event, resolve }) => {
	const start = performance.now();
	const response = await resolve(event);
	const ms = Math.round(performance.now() - start);
	const user = event.locals.user?.id ?? '-';
	console.log(`${event.request.method} ${event.url.pathname} ${response.status} ${ms}ms user=${user}`);
	return response;
};

export const handle: Handle = sequence(logging, auth);

export const handleError: HandleServerError = ({ error, event }) => {
	console.error(`[error] ${event.request.method} ${event.url.pathname}`, error);
	const err = error as { status?: number; body?: App.Error };
	const status = err.status ?? 500;
	if (status < 500 && err.body) {
		return { code: err.body.code, message: err.body.message, retryable: err.body.retryable };
	}
	return {
		code: status === 502 ? 'provider_error' : 'internal_error',
		message: 'Something went wrong.',
		retryable: true
	};
};
