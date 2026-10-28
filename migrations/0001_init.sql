-- Rabbits: MCF's own herd plus every ancestor known from a pedigree (status 'ancestor')
CREATE TABLE rabbits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  ear TEXT NOT NULL DEFAULT '',
  sex TEXT NOT NULL DEFAULT '' CHECK (sex IN ('', 'buck', 'doe')),
  breed TEXT NOT NULL DEFAULT 'Rex',
  color TEXT NOT NULL DEFAULT '',
  genotype TEXT NOT NULL DEFAULT '',
  weight TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL DEFAULT '',
  reg TEXT NOT NULL DEFAULT '',
  gc TEXT NOT NULL DEFAULT '',
  legs TEXT NOT NULL DEFAULT '',
  breeder TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ancestor' CHECK (status IN ('herd', 'ancestor', 'sold', 'deceased')),
  acquired TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  sire_id INTEGER REFERENCES rabbits(id) ON DELETE SET NULL,
  dam_id INTEGER REFERENCES rabbits(id) ON DELETE SET NULL,
  litter_id INTEGER REFERENCES litters(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Breedings: who was bred to whom, and how the litter turned out
CREATE TABLE litters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sire_id INTEGER REFERENCES rabbits(id) ON DELETE SET NULL,
  dam_id INTEGER REFERENCES rabbits(id) ON DELETE SET NULL,
  bred_on TEXT NOT NULL DEFAULT '',
  kindled_on TEXT NOT NULL DEFAULT '',
  born INTEGER,
  alive INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX rabbits_sire ON rabbits(sire_id);
CREATE INDEX rabbits_dam ON rabbits(dam_id);
CREATE INDEX litters_dam ON litters(dam_id);
