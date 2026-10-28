-- Weight log: one row per weighing, stored in ounces so charts and sorting are simple
CREATE TABLE weights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rabbit_id INTEGER NOT NULL REFERENCES rabbits(id) ON DELETE CASCADE,
  weighed_on TEXT NOT NULL DEFAULT '',
  weight_oz REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX weights_rabbit ON weights(rabbit_id);

-- Health and treatment log. withdrawal_days counts from given_on: no processing before it ends.
CREATE TABLE health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rabbit_id INTEGER NOT NULL REFERENCES rabbits(id) ON DELETE CASCADE,
  given_on TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'treatment' CHECK (kind IN ('treatment', 'vaccination', 'vet', 'illness', 'other')),
  item TEXT NOT NULL DEFAULT '',
  dose TEXT NOT NULL DEFAULT '',
  withdrawal_days INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX health_rabbit ON health(rabbit_id);

-- Show results. leg = 1 when the placing earned an ARBA leg.
CREATE TABLE shows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rabbit_id INTEGER NOT NULL REFERENCES rabbits(id) ON DELETE CASCADE,
  show_on TEXT NOT NULL DEFAULT '',
  show_name TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  placing TEXT NOT NULL DEFAULT '',
  exhibitors INTEGER,
  entries INTEGER,
  leg INTEGER NOT NULL DEFAULT 0 CHECK (leg IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX shows_rabbit ON shows(rabbit_id);

-- Rabbitry details (contact info for the sale page, notification and backup settings)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- Phones that have turned on notifications
CREATE TABLE push_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Where each rabbit lives, and whether it's listed on the public sale page
ALTER TABLE rabbits ADD COLUMN cage TEXT NOT NULL DEFAULT '';
ALTER TABLE rabbits ADD COLUMN for_sale INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rabbits ADD COLUMN sale_price TEXT NOT NULL DEFAULT '';
ALTER TABLE rabbits ADD COLUMN sale_notes TEXT NOT NULL DEFAULT '';

-- Litter reminders already ticked off, as a comma-separated list such as "palpate,nestbox"
ALTER TABLE litters ADD COLUMN done TEXT NOT NULL DEFAULT '';
