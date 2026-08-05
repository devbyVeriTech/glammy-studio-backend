import { Errors } from './errors';

type Bucket = {
	windowStart: number;
	count: number;
};

const stores = new Map<string, Map<string, Bucket>>();

/**
 * Minimal in-memory fixed-window rate limiter.
 * Keyed by `scope` (e.g. 'ai' | 'auth') then `subject` (user id or IP).
 */
export function createRateLimiter(max: number, windowMs: number) {
	return {
		async check(scope: string, subject: string): Promise<void> {
			const now = Date.now();
			const store = stores.get(scope) ?? new Map<string, Bucket>();
			const bucket = store.get(subject);

			if (!bucket || now - bucket.windowStart >= windowMs) {
				store.set(subject, { windowStart: now, count: 1 });
				stores.set(scope, store);
				return;
			}

			if (bucket.count >= max) {
				throw Errors.rateLimited();
			}

			bucket.count += 1;
			stores.set(scope, store);
		}
	};
}
