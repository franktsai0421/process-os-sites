import { LocalSetupError } from './local-runtime.mjs';

// Existing databases are inspected, never rebuilt or migrated by this check.
export async function verifyLocalSchema(db, tables) {
  const warnings = [];
  for (const table of tables) {
    const columns = (await db.prepare(`PRAGMA table_info("${table.name}")`).all()).results;
    if (columns.length !== table.columns.length)
      throw new LocalSetupError('Existing Local schema is incomplete; no data was changed');
    for (const column of table.columns) {
      const actual = columns.find(value => value.name === column.name);
      if (!actual || actual.type.toLowerCase() !== column.getSQLType().toLowerCase()
        || Boolean(actual.pk) !== column.primary)
        throw new LocalSetupError('Existing Local schema differs; no data was changed');
      if (Boolean(actual.notnull) === column.notNull) continue;
      if (!column.primary || actual.notnull || !column.notNull || column.name !== 'id')
        throw new LocalSetupError('Existing Local column constraints differ; no data was changed');
      if (table.name === 'shared_state' && actual.type.toLowerCase() === 'integer'
        && columns.filter(value => value.pk).length === 1) {
        const definition = await db.prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?')
          .bind('table', table.name).first();
        if (!definition || /WITHOUT\s+ROWID|PRIMARY\s+KEY\s+DESC/i.test(definition.sql))
          throw new LocalSetupError('Local INTEGER primary key is not a supported rowid alias');
        const invalid = await db.prepare('SELECT COUNT(*) AS count FROM shared_state WHERE id IS NULL OR id IS NOT rowid').first();
        if (Number(invalid.count) !== 0) throw new LocalSetupError('Local INTEGER primary key validation failed');
      } else if (table.name === 'state_backups' && actual.type.toLowerCase() === 'text') {
        const invalid = await db.prepare('SELECT COUNT(*) AS count FROM state_backups WHERE id IS NULL').first();
        const duplicates = await db.prepare('SELECT COUNT(*) AS count FROM (SELECT id FROM state_backups GROUP BY id HAVING COUNT(*) > 1)').first();
        if (Number(invalid.count) !== 0 || Number(duplicates.count) !== 0)
          throw new LocalSetupError('Legacy backup IDs contain NULL or duplicates; no data was changed');
        warnings.push('LEGACY_SCHEMA_WARNING: state_backups.id lacks explicit NOT NULL; valid existing IDs preserved');
      } else throw new LocalSetupError('Unsupported Local primary key constraint difference');
    }
  }
  return warnings;
}
