/**
 * Shared Kernel audit log writer. Source: Stage 4 §18. Now depends on the `Database` interface
 * (data-access.ts) instead of node:sqlite directly, per this migration's data-access abstraction.
 */
import { randomUUID } from 'node:crypto';
import type { Database } from '../data-access';

export const AUDITABLE_ACTIONS = [
  'account_created', 'account_deleted', 'password_changed', 'password_reset',
  'recipe_deleted', 'shift_deleted', 'permission_denied', 'data_exported',
] as const;
export type AuditAction = (typeof AUDITABLE_ACTIONS)[number];

export interface AuditEntry {
  userId: string | null;
  action: AuditAction;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function writeAudit(db: Database, entry: AuditEntry): void {
  if (!(AUDITABLE_ACTIONS as readonly string[]).includes(entry.action)) {
    throw new Error(`writeAudit: "${entry.action}" is not a recognized auditable action (Stage 4 §18)`);
  }
  db.run(
    `INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(), entry.userId, entry.action,
      entry.resourceType ?? null, entry.resourceId ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      Date.now(),
    ]
  );
}
