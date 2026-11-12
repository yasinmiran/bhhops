CREATE TABLE players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  -- The name folded for comparison, so "Ana" and "ana " are the same player name.
  name_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- JSON array of project ids in the order visited, start included.
  path TEXT NOT NULL,
  hops INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  duration_ms INTEGER
);
CREATE INDEX runs_player ON runs(player_id);
CREATE INDEX runs_board ON runs(finished_at, hops, duration_ms);
