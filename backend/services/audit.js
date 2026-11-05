import { AuditLog } from '../models/index.js';

// Who looked at or changed what. Identifiers are never written into the log, only record IDs.
export async function audit(actor, action, target, targetId, meta = {}) {
  await AuditLog.create({ actor: actor?._id, role: actor?.role, action, target, targetId: targetId ? String(targetId) : undefined, meta });
}
