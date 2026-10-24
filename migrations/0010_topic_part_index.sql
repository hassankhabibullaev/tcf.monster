-- Starting a speaking session picks a part by its id: without this index each start read every EO topic (~1 300 rows;
-- the free plan reads 5 million rows a day). Topics are written once a week, so the index costs nothing to keep.
CREATE INDEX topics_part ON topics(section, part_id);
