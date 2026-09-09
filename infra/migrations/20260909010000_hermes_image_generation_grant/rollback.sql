-- Application rollback retains this additive constraint and all image-run records.
-- Do not narrow the constraint or delete image runs to roll back application code.
SELECT 1;
