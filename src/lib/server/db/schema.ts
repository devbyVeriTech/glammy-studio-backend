import { pgTable, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable(
	'users',
	{
		id: text('id').primaryKey(),
		email: text('email').notNull(),
		passwordHash: text('password_hash').notNull(),
		fullName: text('full_name'),
		role: text('role').notNull().default('user'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(table) => [uniqueIndex('users_email_unique').on(table.email)]
);

export const projects = pgTable(
	'projects',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		type: text('type').notNull(), // 'ai' | 'editor'
		name: text('name').notNull(),
		status: text('status').notNull().default('active'),
		coverImageId: text('cover_image_id').references(() => images.id, { onDelete: 'set null' }),
		promptId: text('prompt_id').references(() => prompts.id, { onDelete: 'set null' }),
		category: text('category'),
		sourceImages: text('source_images'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(table) => [index('projects_owner_id_idx').on(table.ownerId)]
);

export const prompts = pgTable(
	'prompts',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		text: text('text').notNull(),
		category: text('category').notNull(),
		normalizedText: text('normalized_text').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(table) => [index('prompts_owner_id_idx').on(table.ownerId)]
);

export const generations = pgTable(
	'generations',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		cacheKey: text('cache_key').notNull(),
		promptId: text('prompt_id').references(() => prompts.id, { onDelete: 'set null' }),
		modelVersion: text('model_version').notNull(),
		status: text('status').notNull().default('processing'), // processing | succeeded | failed
		errorCode: text('error_code'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(table) => [
		index('generations_cache_key_idx').on(table.cacheKey),
		index('generations_owner_id_idx').on(table.ownerId)
	]
);

export const images = pgTable(
	'images',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		sha256: text('sha256').notNull(),
		storageKey: text('storage_key').notNull(),
		publicUrl: text('public_url').notNull(),
		width: integer('width'),
		height: integer('height'),
		format: text('format'),
		fileSize: integer('file_size'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(table) => [uniqueIndex('images_sha256_unique').on(table.sha256)]
);

export const generationImages = pgTable(
	'generation_images',
	{
		generationId: text('generation_id')
			.notNull()
			.references(() => generations.id, { onDelete: 'cascade' }),
		imageId: text('image_id')
			.notNull()
			.references(() => images.id, { onDelete: 'cascade' })
	},
	(table) => [
		index('generation_images_generation_id_idx').on(table.generationId),
		index('generation_images_image_id_idx').on(table.imageId)
	]
);

export const refreshTokens = pgTable(
	'refresh_tokens',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('refresh_tokens_owner_id_idx').on(table.ownerId)]
);

export const settings = pgTable(
	'settings',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		theme: text('theme').notNull().default('system'),
		notificationPreferences: text('notification_preferences').notNull().default('{}'),
		exportPreferences: text('export_preferences').notNull().default('{}'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(table) => [index('settings_owner_id_idx').on(table.ownerId)]
);

export const usage = pgTable(
	'usage',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		operation: text('operation').notNull(),
		category: text('category'),
		cost: integer('cost'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('usage_owner_id_idx').on(table.ownerId)]
);
