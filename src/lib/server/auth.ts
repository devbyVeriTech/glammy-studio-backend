import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '$env/dynamic/private';
import { and, eq, isNull } from 'drizzle-orm';

import { users, refreshTokens } from './db/schema';
import { db } from './db';
import { Errors } from './errors';
import { newId } from './utils';

const BCRYPT_ROUNDS = 12;

/** Parse a duration like "900", "15m", "2h", "7d" into seconds. */
function parseDuration(value: string | undefined, fallbackSeconds: number): number {
	if (!value) return fallbackSeconds;
	const match = /^(\d+)(s|m|h|d)?$/i.exec(value.trim());
	if (!match) return fallbackSeconds;
	const amount = parseInt(match[1], 10);
	const unit = (match[2] ?? 's').toLowerCase();
	switch (unit) {
		case 'm':
			return amount * 60;
		case 'h':
			return amount * 60 * 60;
		case 'd':
			return amount * 24 * 60 * 60;
		default:
			return amount;
	}
}

export type AuthUser = {
	id: string;
	email: string;
	role: string;
};

export type TokenPair = {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
};

export function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}

function getAccessSecret(): string {
	if (!env.JWT_ACCESS_SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
	return env.JWT_ACCESS_SECRET;
}

function getRefreshSecret(): string {
	if (!env.JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET is not set');
	return env.JWT_REFRESH_SECRET;
}

function accessExpirySeconds(): number {
	return parseDuration(env.JWT_ACCESS_EXPIRES, 900);
}

function refreshExpirySeconds(): number {
	return parseDuration(env.JWT_REFRESH_EXPIRES, 30 * 24 * 60 * 60);
}

export async function hashRefreshToken(token: string): Promise<string> {
	return bcrypt.hash(token, BCRYPT_ROUNDS);
}

export async function verifyRefreshToken(token: string, hash: string): Promise<boolean> {
	return bcrypt.compare(token, hash);
}

/** Sign a pair of tokens for a user, persisting the refresh token. */
export async function issueTokenPair(
	user: AuthUser
): Promise<{ pair: TokenPair; tokenId: string }> {
	const tokenId = newId('rft');
	const accessPayload = { sub: user.id, email: user.email, role: user.role, type: 'access' };
	const refreshPayload = { sub: user.id, jti: tokenId, type: 'refresh' };

	const accessToken = jwt.sign(accessPayload, getAccessSecret(), {
		expiresIn: accessExpirySeconds()
	});
	const refreshToken = jwt.sign(refreshPayload, getRefreshSecret(), {
		expiresIn: refreshExpirySeconds()
	});

	const pair: TokenPair = { accessToken, refreshToken, expiresIn: accessExpirySeconds() };
	await persistRefreshToken(user.id, tokenId, pair.refreshToken);

	return { pair, tokenId };
}

/** Store a refresh token (hashed) under its jti. */
async function persistRefreshToken(ownerId: string, jti: string, token: string): Promise<void> {
	const hash = await hashRefreshToken(token);
	await db.insert(refreshTokens).values({
		id: jti,
		ownerId,
		tokenHash: hash,
		expiresAt: new Date(Date.now() + refreshExpirySeconds() * 1000)
	});
}

/** Rotate a refresh token: verify signature + hash match, revoke old, issue new. */
export async function rotateRefreshToken(
	oldToken: string
): Promise<{ user: AuthUser; pair: TokenPair; tokenId: string } | null> {
	const { userId, jti } = verifyRefreshTokenSignature(oldToken) ?? {};
	if (!userId || !jti) return null;

	const user = await findUserById(userId);
	if (!user) return null;

	const record = await findRefreshTokenRecord(jti, userId);
	if (!record || record.expiresAt < new Date()) return null;

	const matches = await verifyRefreshToken(oldToken, record.tokenHash);
	if (!matches) return null;

	const authUser = { id: user.id, email: user.email, role: user.role };
	await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, jti));
	const { pair, tokenId } = await issueTokenPair(authUser);

	return { user: authUser, pair, tokenId };
}

/** Revoke a specific refresh token (matched by its jti). */
export async function revokeRefreshToken(token: string): Promise<void> {
	const { userId, jti } = verifyRefreshTokenSignature(token) ?? {};
	if (!userId || !jti) return;
	const record = await findRefreshTokenRecord(jti, userId);
	if (!record) return;
	const matches = await verifyRefreshToken(token, record.tokenHash);
	if (!matches) return;
	await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, jti));
}

async function findRefreshTokenRecord(jti: string, ownerId: string) {
	const rows = await db
		.select()
		.from(refreshTokens)
		.where(and(eq(refreshTokens.id, jti), eq(refreshTokens.ownerId, ownerId), isNull(refreshTokens.revokedAt)))
		.limit(1);
	return rows[0] ?? null;
}

/** Verify an access token. Returns null when invalid/expired. */
export function verifyAccessToken(token: string): AuthUser | null {
	try {
		const payload = jwt.verify(token, getAccessSecret());
		if (typeof payload === 'string' || payload.type !== 'access') return null;
		return {
			id: payload.sub as string,
			email: payload.email as string,
			role: payload.role as string
		};
	} catch {
		return null;
	}
}

/** Verify a refresh token, returning its subject (user id) and jti. */
export function verifyRefreshTokenSignature(token: string): { userId: string; jti: string } | null {
	try {
		const payload = jwt.verify(token, getRefreshSecret());
		if (typeof payload === 'string' || payload.type !== 'refresh') return null;
		return { userId: payload.sub as string, jti: payload.jti as string };
	} catch {
		return null;
	}
}

/** Resolve a user id to an AuthUser, throwing 401 when the account is gone. */
export async function getAuthUserById(id: string): Promise<AuthUser> {
	const row = await db.select().from(users).where(eq(users.id, id)).limit(1);
	const user = row[0];
	if (!user) throw Errors.unauthorized('Account no longer exists.');
	return { id: user.id, email: user.email, role: user.role };
}

/** Create a user row if the email is free. Throws 409 on duplicates. */
export async function createUser(email: string, passwordHash: string, fullName?: string) {
	const existing = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email.toLowerCase()))
		.limit(1);
	if (existing.length > 0) {
		throw Errors.conflict('An account with this email already exists.');
	}
	const user = {
		id: newId('usr'),
		email: email.toLowerCase(),
		passwordHash,
		fullName: fullName ?? null,
		role: 'user'
	};
	await db.insert(users).values(user);
	return user;
}

/** Load a user by id. */
export async function findUserById(id: string) {
	const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
	return rows[0] ?? null;
}

/** Load a user by email (case-insensitive). */
export async function findUserByEmail(email: string) {
	const rows = await db
		.select()
		.from(users)
		.where(eq(users.email, email.toLowerCase()))
		.limit(1);
	return rows[0] ?? null;
}

/** Extract the Bearer token from an authorization header. */
export function extractBearerToken(authorization: string | null): string | null {
	if (!authorization) return null;
	const match = /^Bearer\s+(.+)$/i.exec(authorization);
	return match?.[1] ?? null;
}

/** Throw 401 unless locals.user is set. Returns the user. */
export function requireUser(locals: App.Locals): AuthUser {
	if (!locals.user) throw Errors.unauthorized();
	return locals.user;
}

/** Sign a short-lived password reset token for a user id. */
export function signPasswordResetToken(userId: string): string {
	return jwt.sign({ sub: userId, type: 'reset' }, getAccessSecret(), { expiresIn: '1h' });
}

/** Verify a password reset token, returning the user id or null. */
export function verifyPasswordResetToken(token: string): string | null {
	try {
		const payload = jwt.verify(token, getAccessSecret());
		if (typeof payload === 'string' || payload.type !== 'reset') return null;
		return payload.sub as string;
	} catch {
		return null;
	}
}
