import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATION_FILE = /^(\d{4})_.+\.sql$/;

/** Opens the database and applies every migration newer than its `user_version`. */
export function openDatabase(path: string, migrationsDir: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

  const { user_version: applied } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  const pending = readdirSync(migrationsDir)
    .filter((file) => MIGRATION_FILE.test(file))
    .sort()
    .map((file) => ({ file, version: Number(file.slice(0, 4)) }))
    .filter((migration) => migration.version > applied);

  for (const { file, version } of pending) {
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(join(migrationsDir, file), "utf8"));
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return db;
}
