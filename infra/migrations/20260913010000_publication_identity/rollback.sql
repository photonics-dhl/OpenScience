-- Retention compensation: keep this additive column/index and captured metadata.
-- Once a new public number is issued, dropping it or restoring a pre-feature
-- reader would break permanent URLs. Roll back other application changes using
-- a release that retains publicationNo URL resolution and snapshot reads.
-- No private or public content is deleted by this rollback.
SELECT 'publication identity data retained; use a compatible application rollback' AS rollback_action;
