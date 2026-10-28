-- Weekly automatic backups of the herd records (the newest 12 are kept)
CREATE TABLE backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  data TEXT NOT NULL
);
