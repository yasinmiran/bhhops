#!/usr/bin/env bash
# Empties the leaderboard: every player and every tour go. Run it on the server.
# A copy of the database as it was is kept beside it first, as /data/before-reset-<time>.db.
#
#   ssh almalinux@<server> bhhops/deploy/reset.sh
set -euo pipefail

sudo podman exec hops_api_1 node --no-warnings -e '
  const { readFileSync } = require("node:fs");
  const { DatabaseSync } = require("node:sqlite");
  const copy = `/data/before-reset-${new Date().toISOString().replace(/[-:.]/g, "")}.db`;
  new DatabaseSync(process.env.DATABASE_PATH).exec(`VACUUM INTO \x27${copy}\x27`);
  // The token never leaves the container: it is read here and sent to the API on this same machine.
  const token = process.env.ADMIN_TOKEN || readFileSync("/data/admin-token", "utf8").trim();
  fetch("http://127.0.0.1:8787/api/admin/reset", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ confirm: "reset" }),
  })
    .then(async (answer) => {
      if (!answer.ok) throw new Error(`the server said ${answer.status}: ${await answer.text()}`);
      const gone = await answer.json();
      console.log(`Removed ${gone.players} players and ${gone.tours} tours. The old database is kept as ${copy}.`);
    })
    .catch((error) => {
      console.error(`Nothing was removed: ${error.message}`);
      process.exit(1);
    });
'
