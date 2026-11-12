import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const ADMIN_TOKEN_PATTERN = /^[0-9a-f]{32,}$/;

const DATABASE_PATH = process.env.DATABASE_PATH ?? "hops.db";

/** The token given in the environment, or one this server made for itself and keeps beside the database, where only the operator can read it. */
function adminToken(): string {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  const kept = join(dirname(DATABASE_PATH), "admin-token");
  const stored = existsSync(kept) ? readFileSync(kept, "utf8").trim() : "";
  // A file cut short by a full disk or a kill is replaced, or the server could never start again.
  if (ADMIN_TOKEN_PATTERN.test(stored)) return stored;
  const made = randomBytes(32).toString("hex");
  writeFileSync(kept, made, { mode: 0o600 });
  return made;
}

const token = adminToken();
// The admin route has no lockout that would stop guessing, so the token itself has to be unguessable.
if (!ADMIN_TOKEN_PATTERN.test(token)) {
  console.error("ADMIN_TOKEN must be at least 32 hex characters; make one with: openssl rand -hex 32");
  process.exit(1);
}

const db = openDatabase(DATABASE_PATH, new URL("./migrations", import.meta.url).pathname);
const app = createApp({ db, adminToken: token });
// One proxy (Caddy) sits in front, and its X-Forwarded-For is the only one to believe.
app.set("trust proxy", 1);

const server = app.listen(PORT, HOST, () => console.log(`31 hops api on http://${HOST}:${PORT}`));

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    server.closeIdleConnections();
  });
}
