-- 021_photo_order_column.sql
-- Add photo_order column to galleries to replace the photo_order.json sidecar file.
-- The JSON text is the full ordered array of filenames, e.g. '["a.jpg","b.jpg"]'.
-- NULL means no explicit order (sort alphabetically).
-- The API will lazily migrate existing photo_order.json files on first read.

ALTER TABLE galleries ADD COLUMN photo_order TEXT;
