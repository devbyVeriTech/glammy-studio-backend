import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

export async function GET() {
	const startedAt = performance.now();
	try {
		await db.execute(sql`select 1`);
		return json({
			status: 'ok',
			db: 'ok',
			uptimeMs: Math.round(performance.now() - startedAt),
			timestamp: new Date().toISOString()
		});
	} catch {
		return json({ status: 'degraded', db: 'error' }, { status: 503 });
	}
}
