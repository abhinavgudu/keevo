/**
 * Telling a missing table or column apart from a real failure.
 *
 * PostgREST reports a missing column two different ways depending on whether the
 * table exists at all, and both have to be recognised:
 *
 *   - "column ... does not exist"          — the classic SQL error
 *   - PGRST204 "Could not find the 'x' column of 'y' in the schema cache" —
 *     what PostgREST actually returns for an unknown column
 *
 * Missing the second one is how a migration that has not been run yet turns into
 * a 500 with a stack trace, instead of the "run the migration" message the API
 * routes already return for a missing table.
 *
 * Shared rather than inlined so every route recognises the same set of shapes;
 * the alternative was three near-identical regexes drifting apart.
 */

/** PostgreSQL's undefined_column, and PostgREST's schema-cache variant. */
const MISSING_COLUMN = /does not exist|PGRST204|schema cache|Could not find the/i;

/** The relation-not-found family, for a table that does not exist yet. */
const MISSING_TABLE = /does not exist|relation .* does not exist|not find|PGRST205/i;

/**
 * True when the error says the named table is missing, so the caller can answer
 * "run the migration" instead of reporting a server fault.
 */
export function isMissingTable(error: unknown, table: string): boolean {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== 'string') return false;
  return message.includes(table) && MISSING_TABLE.test(message);
}

/**
 * True when the error says the named column is missing.
 *
 * The name is checked too, because PGRST204 fires for any unknown column and the
 * caller needs to know *which* one.
 */
export function isMissingColumn(error: unknown, column: string): boolean {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== 'string') return false;
  return message.includes(column) && MISSING_COLUMN.test(message);
}

/**
 * True when the error is a not-yet-run migration for either a table or a column.
 *
 * The one to reach for when a route writes to a table that recent work has added
 * columns to: whether the failure names the table or the new column depends on
 * the schema state, and both mean the same thing to the user.
 */
export function isSchemaNotReady(error: unknown, table: string, column?: string): boolean {
  return isMissingTable(error, table) || (column ? isMissingColumn(error, column) : false);
}