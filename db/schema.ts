import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

// Optional management history. Adoption is a reviewed, additive migration.
export const accessEvents = sqliteTable('access_events', {
  id: text('id').primaryKey().notNull(), actorId: text('actor_id').notNull(),
  module: text('module').notNull(), operationId: text('operation_id').notNull(),
  action: text('action').notNull(), occurredAt: integer('occurred_at').notNull(),
  receivedAt: text('received_at').notNull(), updatedAt: text('updated_at').notNull(),
  outcome: text('outcome').notNull(), verifiedAt: text('verified_at'),
  status: text('status').notNull(), version: integer('version').notNull(),
  notes: text('notes').notNull(), history: text('history').notNull(),
  updateReceipts: text('update_receipts').notNull(),
}, table => [
  uniqueIndex('access_events_actor_module_operation').on(table.actorId,table.module,table.operationId),
  index('access_events_status_cursor').on(table.status,table.id),
  check('access_events_outcome',sql`${table.outcome} IN ('unknown','receipt-confirmed')`),
  check('access_events_status',sql`${table.status} IN ('open','handled')`),
]);

export const accessEventExports = sqliteTable('access_event_exports', {
  id: text('id').primaryKey().notNull(), actorId: text('actor_id').notNull(),
  operationId: text('operation_id').notNull(), digest: text('digest').notNull(),
  generatedAt: text('generated_at').notNull(), modules: text('modules').notNull(),
  ids: text('ids').notNull(), count: integer('count').notNull(),
  size: integer('size').notNull(), sha256: text('sha256').notNull(),
}, table => [uniqueIndex('access_event_exports_actor_operation').on(table.actorId,table.operationId)]);
