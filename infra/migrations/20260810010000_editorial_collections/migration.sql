CREATE TYPE "EditorialSelectionState" AS ENUM ('draft', 'internal_review', 'scheduled', 'published');

CREATE TABLE "editorial_collections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "editorial_collections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "editorial_selections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "collection_id" UUID NOT NULL,
  "research_object_id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "selected_by" UUID NOT NULL,
  "title_snapshot" TEXT NOT NULL,
  "public_id_snapshot" TEXT NOT NULL,
  "version_no_snapshot" INTEGER NOT NULL,
  "sdf_snapshot" JSONB NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "media" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "disclosure" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "state" "EditorialSelectionState" NOT NULL DEFAULT 'draft',
  "scheduled_at" TIMESTAMP(3),
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "editorial_selections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "editorial_selections_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "editorial_collections"("id") ON DELETE CASCADE,
  CONSTRAINT "editorial_selections_research_object_id_fkey" FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE RESTRICT,
  CONSTRAINT "editorial_selections_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "versions"("id") ON DELETE RESTRICT,
  CONSTRAINT "editorial_selections_selected_by_fkey" FOREIGN KEY ("selected_by") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "editorial_collections_slug_key" ON "editorial_collections"("slug");
CREATE UNIQUE INDEX "editorial_selections_collection_ro_version_key" ON "editorial_selections"("collection_id", "research_object_id", "version_id");
CREATE INDEX "editorial_selections_collection_state_sort_idx" ON "editorial_selections"("collection_id", "state", "sort_order");
CREATE INDEX "editorial_selections_research_object_id_idx" ON "editorial_selections"("research_object_id");
CREATE INDEX "editorial_selections_version_id_idx" ON "editorial_selections"("version_id");

INSERT INTO "editorial_collections" ("id", "slug", "title", "description")
VALUES (
  '00000000-0000-4000-8000-000000000011',
  'ultrafast-science',
  'Ultrafast Science',
  'A journal-curated reading layer over versioned OpenScience Research Objects.'
);
