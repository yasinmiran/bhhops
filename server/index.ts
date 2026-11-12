import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const ADMIN_TOKEN_PATTERN = /^[0-9a-f]{32,}$/;

const adminToken = process.env.ADMIN_TOKEN || undefined;
// The admin route has no lockout that would stop guessing, so the token itself has to be unguessable.
if (adminToken && !ADMIN_TOKEN_PATTERN.test(adminToken)) {
  console.error("ADMIN_TOKEN must be at least 32 hex characters; make one with: openssl rand -hex 32");
  process.exit(1);
}

const db = openDatabase(process.env.DATABASE_PATH ?? "hops.db", new URL("./migrations", import.meta.url).pathname);
const app = createApp({ db, adminToken });
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
