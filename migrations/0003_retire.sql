-- Why and when a rabbit left the herd. Status stays 'sold' or 'deceased'; the reason says more
-- ('Sold', 'Gave away', 'Died', 'Culled'). Added as columns because rebuilding the table to widen
-- the status check would clear every sire and dam link through ON DELETE SET NULL.
ALTER TABLE rabbits ADD COLUMN left_on TEXT NOT NULL DEFAULT '';
ALTER TABLE rabbits ADD COLUMN left_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE rabbits ADD COLUMN left_to TEXT NOT NULL DEFAULT '';
ALTER TABLE rabbits ADD COLUMN price TEXT NOT NULL DEFAULT '';
