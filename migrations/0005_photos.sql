-- Photos of each rabbit, newest or oldest. The image bytes live in the separate likearabbit-photos
-- database (binding PHOTOS) under the same id, so this one stays small and quick to load.
CREATE TABLE photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rabbit_id INTEGER NOT NULL REFERENCES rabbits(id) ON DELETE CASCADE,
  taken_on TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'pedigree')),
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX photos_rabbit ON photos(rabbit_id);

-- The photo shown for the rabbit on its page, herd card and pedigree PDF
ALTER TABLE rabbits ADD COLUMN photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL;
