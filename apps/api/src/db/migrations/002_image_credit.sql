-- Provenance for menu photography.
--
-- Stock libraries permit commercial use, but that permission is only worth
-- anything if you can show where a photo came from. This records the source,
-- the photographer and the licence for every imported image so the claim can
-- be evidenced later; photos uploaded by hand simply leave it null.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_credit jsonb;

COMMENT ON COLUMN menu_items.image_credit IS
  'Where an imported photo came from: {source, photographer, photographer_url, source_url, license, imported_at}';
