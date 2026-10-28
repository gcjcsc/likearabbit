-- Image bytes for each photo, keyed by the photo's id in the main database's photos table
CREATE TABLE photo_files (
  id INTEGER PRIMARY KEY,
  full BLOB NOT NULL,
  thumb BLOB NOT NULL
);
