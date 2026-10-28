-- The rabbit's ear tattoo, kept separately from the ear number on its pedigree
ALTER TABLE rabbits ADD COLUMN tattoo TEXT NOT NULL DEFAULT '';
