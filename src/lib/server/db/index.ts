import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const globalForDb = globalThis as unknown as { __glammyDb?: ReturnType<typeof createClient> };

function createClient() {
	const client = postgres(env.DATABASE_URL, { max: 10, prepare: false });
	return drizzle(client, { schema });
}

export const db = globalForDb.__glammyDb ?? createClient();

if (process.env.NODE_ENV !== 'production') {
	globalForDb.__glammyDb = db;
}
