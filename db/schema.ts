import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const stateBackups = sqliteTable('state_backups', {
  id: text('id').primaryKey(), revision: integer('revision').notNull(),
  values: text('values').notNull(), reason: text('reason').notNull(),
  actor: text('actor').notNull(), createdAt: text('created_at').notNull(),
});

export const sharedState = sqliteTable('shared_state', {
  id: integer('id').primaryKey(),
  revision: integer('revision').notNull(),
  values: text('values').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const webFeedbackStore = sqliteTable('web_feedback_store', {
  id: integer('id').primaryKey().notNull(),
  revision: integer('revision').notNull(),
  payload: text('payload').notNull(),
});

export const processRevokedSessions = sqliteTable('process_revoked_sessions', {
  tokenDigest: text('token_digest').primaryKey().notNull(),
  expiresAt: integer('expires_at').notNull(),
  revokedAt: integer('revoked_at').notNull(),
});

export const processLoginLimits = sqliteTable('process_login_limits', {
  key: text('key').primaryKey().notNull(),
  bucketStart: integer('bucket_start').notNull(),
  attempts: integer('attempts').notNull(),
});
