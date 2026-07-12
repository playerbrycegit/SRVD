'use strict';
/**
 * Shared Kernel audit log writer. Source of truth: Stage 4 §18, Stage 9 §2 ("implemented as a
 * shared, reusable writer, never reimplemented per-module").
 */
const { randomUUID } = require('node:crypto');

const AUDITABLE_ACTIONS = Object.freeze([
  'account_created', 'account_deleted', 'password_changed', 'password_reset',
  'recipe_deleted', 'shift_deleted', 'permission_denied', 'data_exported',
]);

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ userId: string|null, action: string, resourceType?: string, resourceId?: string, metadata?: object }} entry
 */
function writeAudit(db, { userId, action, resourceType = null, resourceId = null, metadata = null }) {
  if (!AUDITABLE_ACTIONS.includes(action)) {
    throw new Error(`writeAudit: "${action}" is not a recognized auditable action (Stage 4 §18)`);
  }
  db.prepare(`
    INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), userId, action, resourceType, resourceId, metadata ? JSON.stringify(metadata) : null, Date.now());
}

module.exports = { writeAudit, AUDITABLE_ACTIONS };
