ALTER TABLE "research_objects" ADD COLUMN "original_doi" TEXT;
CREATE INDEX "research_objects_workspace_id_original_doi_idx" ON "research_objects"("workspace_id", "original_doi");
