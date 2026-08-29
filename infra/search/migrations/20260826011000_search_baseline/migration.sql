CREATE TABLE "search_schema_meta" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_schema_meta_pkey" PRIMARY KEY ("key")
);
