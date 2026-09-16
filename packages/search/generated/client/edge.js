
Object.defineProperty(exports, "__esModule", { value: true });

const {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientRustPanicError,
  PrismaClientInitializationError,
  PrismaClientValidationError,
  NotFoundError,
  getPrismaClient,
  sqltag,
  empty,
  join,
  raw,
  skip,
  Decimal,
  Debug,
  objectEnumValues,
  makeStrictEnum,
  Extensions,
  warnOnce,
  defineDmmfProperty,
  Public,
  getRuntime
} = require('./runtime/edge.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = PrismaClientKnownRequestError;
Prisma.PrismaClientUnknownRequestError = PrismaClientUnknownRequestError
Prisma.PrismaClientRustPanicError = PrismaClientRustPanicError
Prisma.PrismaClientInitializationError = PrismaClientInitializationError
Prisma.PrismaClientValidationError = PrismaClientValidationError
Prisma.NotFoundError = NotFoundError
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = sqltag
Prisma.empty = empty
Prisma.join = join
Prisma.raw = raw
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = Extensions.getExtensionContext
Prisma.defineExtension = Extensions.defineExtension

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}





/**
 * Enums
 */
exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.SearchSchemaMetaScalarFieldEnum = {
  key: 'key',
  value: 'value',
  updatedAt: 'updatedAt'
};

exports.Prisma.SearchModelVersionScalarFieldEnum = {
  id: 'id',
  provider: 'provider',
  model: 'model',
  revision: 'revision',
  dimension: 'dimension',
  sourceSha256: 'sourceSha256',
  packageFreezeSha256: 'packageFreezeSha256',
  modelManifestSha256: 'modelManifestSha256',
  status: 'status',
  createdAt: 'createdAt',
  retiredAt: 'retiredAt'
};

exports.Prisma.SearchChunkScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  researchObjectId: 'researchObjectId',
  artifactId: 'artifactId',
  sourceVersionId: 'sourceVersionId',
  sourceVersionNo: 'sourceVersionNo',
  indexTaskId: 'indexTaskId',
  contentHash: 'contentHash',
  ordinal: 'ordinal',
  language: 'language',
  text: 'text',
  tokenCount: 'tokenCount',
  locators: 'locators',
  claimIds: 'claimIds',
  lexicalTerms: 'lexicalTerms',
  termFrequencies: 'termFrequencies',
  lexicalText: 'lexicalText',
  active: 'active',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SearchEmbeddingScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  chunkId: 'chunkId',
  modelVersionId: 'modelVersionId',
  dimension: 'dimension',
  vector: 'vector',
  vectorSha256: 'vectorSha256',
  norm: 'norm',
  createdAt: 'createdAt'
};

exports.Prisma.SearchIndexTaskScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  researchObjectId: 'researchObjectId',
  artifactId: 'artifactId',
  sourceVersionId: 'sourceVersionId',
  sourceVersionNo: 'sourceVersionNo',
  contentHash: 'contentHash',
  modelVersionId: 'modelVersionId',
  sourceGenerationSha256: 'sourceGenerationSha256',
  sourceCreatedAt: 'sourceCreatedAt',
  status: 'status',
  attemptCount: 'attemptCount',
  errorCode: 'errorCode',
  leaseToken: 'leaseToken',
  fenceOwnerTaskId: 'fenceOwnerTaskId',
  fenceOwnerCreatedAt: 'fenceOwnerCreatedAt',
  fenceOwnerAttempt: 'fenceOwnerAttempt',
  leaseExpiresAt: 'leaseExpiresAt',
  isCurrent: 'isCurrent',
  createdAt: 'createdAt',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt'
};

exports.Prisma.SearchQueryMetricScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  queryHash: 'queryHash',
  lexicalAvailable: 'lexicalAvailable',
  denseAvailable: 'denseAvailable',
  resultCount: 'resultCount',
  lexicalLatencyMs: 'lexicalLatencyMs',
  denseLatencyMs: 'denseLatencyMs',
  totalLatencyMs: 'totalLatencyMs',
  errorCode: 'errorCode',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  SearchSchemaMeta: 'SearchSchemaMeta',
  SearchModelVersion: 'SearchModelVersion',
  SearchChunk: 'SearchChunk',
  SearchEmbedding: 'SearchEmbedding',
  SearchIndexTask: 'SearchIndexTask',
  SearchQueryMetric: 'SearchQueryMetric'
};
/**
 * Create the Client
 */
const config = {
  "generator": {
    "name": "client",
    "provider": {
      "fromEnvVar": null,
      "value": "prisma-client-js"
    },
    "output": {
      "value": "/opt/openscience-releases/48814fe00640022ea188c45067994fda60508939/packages/search/generated/client",
      "fromEnvVar": null
    },
    "config": {
      "engineType": "library"
    },
    "binaryTargets": [
      {
        "fromEnvVar": null,
        "value": "debian-openssl-3.0.x",
        "native": true
      },
      {
        "fromEnvVar": null,
        "value": "linux-musl"
      }
    ],
    "previewFeatures": [],
    "sourceFilePath": "/opt/openscience-releases/48814fe00640022ea188c45067994fda60508939/infra/search/schema.prisma",
    "isCustomOutput": true
  },
  "relativeEnvPaths": {
    "rootEnvPath": null
  },
  "relativePath": "../../../../infra/search",
  "clientVersion": "5.22.0",
  "engineVersion": "605197351a3c8bdd595af2d2a9bc3025bca48ea2",
  "datasourceNames": [
    "search"
  ],
  "activeProvider": "postgresql",
  "postinstall": false,
  "inlineDatasources": {
    "search": {
      "url": {
        "fromEnvVar": "SEARCH_DATABASE_URL",
        "value": null
      }
    }
  },
  "inlineSchema": "generator client {\n  provider      = \"prisma-client-js\"\n  output        = \"../../packages/search/generated/client\"\n  binaryTargets = [\"native\", \"linux-musl\"]\n}\n\ndatasource search {\n  provider = \"postgresql\"\n  url      = env(\"SEARCH_DATABASE_URL\")\n}\n\nmodel SearchSchemaMeta {\n  key       String   @id\n  value     Json\n  updatedAt DateTime @default(now()) @updatedAt @map(\"updated_at\")\n\n  @@map(\"search_schema_meta\")\n}\n\nmodel SearchModelVersion {\n  id                  String            @id @default(uuid()) @search.Uuid\n  provider            String            @search.VarChar(64)\n  model               String            @search.VarChar(128)\n  revision            String            @search.VarChar(128)\n  dimension           Int\n  sourceSha256        String            @map(\"source_sha256\") @search.Char(64)\n  packageFreezeSha256 String            @map(\"package_freeze_sha256\") @search.Char(64)\n  modelManifestSha256 String            @map(\"model_manifest_sha256\") @search.Char(64)\n  status              String            @default(\"candidate\") @search.VarChar(32)\n  createdAt           DateTime          @default(now()) @map(\"created_at\")\n  retiredAt           DateTime?         @map(\"retired_at\")\n  embeddings          SearchEmbedding[]\n  indexTasks          SearchIndexTask[]\n\n  @@unique([provider, model, revision], map: \"search_model_versions_identity_key\")\n  @@map(\"search_model_versions\")\n}\n\nmodel SearchChunk {\n  id               String                   @id @search.Char(64)\n  workspaceId      String                   @map(\"workspace_id\") @search.Uuid\n  researchObjectId String                   @map(\"research_object_id\") @search.Uuid\n  artifactId       String                   @map(\"artifact_id\") @search.Uuid\n  sourceVersionId  String?                  @map(\"source_version_id\") @search.Uuid\n  sourceVersionNo  Int?                     @map(\"source_version_no\")\n  indexTaskId      String?                  @map(\"index_task_id\") @search.Uuid\n  contentHash      String                   @map(\"content_hash\") @search.Char(64)\n  ordinal          Int\n  language         String                   @search.VarChar(16)\n  text             String                   @search.Text\n  tokenCount       Int                      @map(\"token_count\")\n  locators         Json\n  claimIds         Json                     @map(\"claim_ids\")\n  lexicalTerms     Json                     @map(\"lexical_terms\")\n  termFrequencies  Json                     @map(\"term_frequencies\")\n  lexicalText      String                   @map(\"lexical_text\") @search.Text\n  searchVector     Unsupported(\"tsvector\")? @map(\"search_vector\")\n  active           Boolean                  @default(true)\n  createdAt        DateTime                 @default(now()) @map(\"created_at\")\n  updatedAt        DateTime                 @default(now()) @updatedAt @map(\"updated_at\")\n  embeddings       SearchEmbedding[]\n  indexTask        SearchIndexTask?         @relation(fields: [indexTaskId], references: [id], onDelete: Cascade)\n\n  @@unique([workspaceId, id], map: \"search_chunks_workspace_id_id_key\")\n  @@unique([workspaceId, indexTaskId, ordinal], map: \"search_chunks_generation_ordinal_key\")\n  @@index([workspaceId, researchObjectId, active], map: \"search_chunks_workspace_ro_active_idx\")\n  @@index([workspaceId, artifactId, contentHash], map: \"search_chunks_workspace_artifact_hash_idx\")\n  @@map(\"search_chunks\")\n}\n\nmodel SearchEmbedding {\n  id             String             @id @default(uuid()) @search.Uuid\n  workspaceId    String             @map(\"workspace_id\") @search.Uuid\n  chunkId        String             @map(\"chunk_id\") @search.Char(64)\n  modelVersionId String             @map(\"model_version_id\") @search.Uuid\n  dimension      Int\n  vector         Bytes              @search.ByteA\n  vectorSha256   String             @map(\"vector_sha256\") @search.Char(64)\n  norm           Float              @search.DoublePrecision\n  createdAt      DateTime           @default(now()) @map(\"created_at\")\n  chunk          SearchChunk        @relation(fields: [workspaceId, chunkId], references: [workspaceId, id], onDelete: Cascade)\n  modelVersion   SearchModelVersion @relation(fields: [modelVersionId], references: [id], onDelete: Restrict)\n\n  @@unique([workspaceId, chunkId, modelVersionId], map: \"search_embeddings_chunk_model_key\")\n  @@index([workspaceId, modelVersionId], map: \"search_embeddings_workspace_model_idx\")\n  @@map(\"search_embeddings\")\n}\n\nmodel SearchIndexTask {\n  id                     String             @id @default(uuid()) @search.Uuid\n  workspaceId            String             @map(\"workspace_id\") @search.Uuid\n  researchObjectId       String             @map(\"research_object_id\") @search.Uuid\n  artifactId             String             @map(\"artifact_id\") @search.Uuid\n  sourceVersionId        String             @map(\"source_version_id\") @search.Uuid\n  sourceVersionNo        Int                @map(\"source_version_no\")\n  contentHash            String             @map(\"content_hash\") @search.Char(64)\n  modelVersionId         String             @map(\"model_version_id\") @search.Uuid\n  sourceGenerationSha256 String             @map(\"source_generation_sha256\") @search.Char(64)\n  sourceCreatedAt        DateTime           @map(\"source_created_at\")\n  status                 String             @default(\"queued\") @search.VarChar(32)\n  attemptCount           Int                @default(0) @map(\"attempt_count\")\n  errorCode              String?            @map(\"error_code\") @search.VarChar(64)\n  leaseToken             String?            @map(\"lease_token\") @search.Char(64)\n  fenceOwnerTaskId       String?            @map(\"fence_owner_task_id\") @search.Uuid\n  fenceOwnerCreatedAt    DateTime?          @map(\"fence_owner_created_at\")\n  fenceOwnerAttempt      Int?               @map(\"fence_owner_attempt\")\n  leaseExpiresAt         DateTime?          @map(\"lease_expires_at\")\n  isCurrent              Boolean            @default(false) @map(\"is_current\")\n  createdAt              DateTime           @default(now()) @map(\"created_at\")\n  startedAt              DateTime?          @map(\"started_at\")\n  finishedAt             DateTime?          @map(\"finished_at\")\n  modelVersion           SearchModelVersion @relation(fields: [modelVersionId], references: [id], onDelete: Restrict)\n  chunks                 SearchChunk[]\n\n  @@unique([workspaceId, researchObjectId, artifactId, sourceVersionId, contentHash, modelVersionId, sourceGenerationSha256], map: \"search_index_tasks_generation_model_key\")\n  @@index([status, createdAt], map: \"search_index_tasks_status_created_idx\")\n  @@index([workspaceId, researchObjectId], map: \"search_index_tasks_workspace_ro_idx\")\n  @@index([workspaceId, researchObjectId, artifactId, isCurrent], map: \"search_index_tasks_current_idx\")\n  @@map(\"search_index_tasks\")\n}\n\nmodel SearchQueryMetric {\n  id               String   @id @default(uuid()) @search.Uuid\n  workspaceId      String   @map(\"workspace_id\") @search.Uuid\n  queryHash        String   @map(\"query_hash\") @search.Char(64)\n  lexicalAvailable Boolean  @map(\"lexical_available\")\n  denseAvailable   Boolean  @map(\"dense_available\")\n  resultCount      Int      @map(\"result_count\")\n  lexicalLatencyMs Int?     @map(\"lexical_latency_ms\")\n  denseLatencyMs   Int?     @map(\"dense_latency_ms\")\n  totalLatencyMs   Int      @map(\"total_latency_ms\")\n  errorCode        String?  @map(\"error_code\") @search.VarChar(64)\n  createdAt        DateTime @default(now()) @map(\"created_at\")\n\n  @@index([workspaceId, createdAt], map: \"search_query_metrics_workspace_created_idx\")\n  @@map(\"search_query_metrics\")\n}\n",
  "inlineSchemaHash": "10b94902a7f84396072d0d0c9f652fcffb534382a594d46770aaafabd970d734",
  "copyEngine": true
}
config.dirname = '/'

config.runtimeDataModel = JSON.parse("{\"models\":{\"SearchSchemaMeta\":{\"dbName\":\"search_schema_meta\",\"fields\":[{\"name\":\"key\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"value\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":true}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"SearchModelVersion\":{\"dbName\":\"search_model_versions\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"provider\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"model\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"revision\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"dimension\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"sourceSha256\",\"dbName\":\"source_sha256\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"packageFreezeSha256\",\"dbName\":\"package_freeze_sha256\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"modelManifestSha256\",\"dbName\":\"model_manifest_sha256\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"status\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":\"candidate\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"retiredAt\",\"dbName\":\"retired_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"embeddings\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"SearchEmbedding\",\"relationName\":\"SearchEmbeddingToSearchModelVersion\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"indexTasks\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"SearchIndexTask\",\"relationName\":\"SearchIndexTaskToSearchModelVersion\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[[\"provider\",\"model\",\"revision\"]],\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"provider\",\"model\",\"revision\"]}],\"isGenerated\":false},\"SearchChunk\":{\"dbName\":\"search_chunks\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"workspaceId\",\"dbName\":\"workspace_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"researchObjectId\",\"dbName\":\"research_object_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"artifactId\",\"dbName\":\"artifact_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"sourceVersionId\",\"dbName\":\"source_version_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"sourceVersionNo\",\"dbName\":\"source_version_no\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"indexTaskId\",\"dbName\":\"index_task_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"contentHash\",\"dbName\":\"content_hash\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"ordinal\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"language\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"text\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"tokenCount\",\"dbName\":\"token_count\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"locators\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"claimIds\",\"dbName\":\"claim_ids\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"lexicalTerms\",\"dbName\":\"lexical_terms\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"termFrequencies\",\"dbName\":\"term_frequencies\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"lexicalText\",\"dbName\":\"lexical_text\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"active\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"default\":true,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"embeddings\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"SearchEmbedding\",\"relationName\":\"SearchChunkToSearchEmbedding\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"indexTask\",\"kind\":\"object\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"SearchIndexTask\",\"relationName\":\"SearchChunkToSearchIndexTask\",\"relationFromFields\":[\"indexTaskId\"],\"relationToFields\":[\"id\"],\"relationOnDelete\":\"Cascade\",\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[[\"workspaceId\",\"id\"],[\"workspaceId\",\"indexTaskId\",\"ordinal\"]],\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"workspaceId\",\"id\"]},{\"name\":null,\"fields\":[\"workspaceId\",\"indexTaskId\",\"ordinal\"]}],\"isGenerated\":false},\"SearchEmbedding\":{\"dbName\":\"search_embeddings\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"workspaceId\",\"dbName\":\"workspace_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"chunkId\",\"dbName\":\"chunk_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"modelVersionId\",\"dbName\":\"model_version_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"dimension\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"vector\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Bytes\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"vectorSha256\",\"dbName\":\"vector_sha256\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"norm\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Float\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"chunk\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"SearchChunk\",\"relationName\":\"SearchChunkToSearchEmbedding\",\"relationFromFields\":[\"workspaceId\",\"chunkId\"],\"relationToFields\":[\"workspaceId\",\"id\"],\"relationOnDelete\":\"Cascade\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"modelVersion\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"SearchModelVersion\",\"relationName\":\"SearchEmbeddingToSearchModelVersion\",\"relationFromFields\":[\"modelVersionId\"],\"relationToFields\":[\"id\"],\"relationOnDelete\":\"Restrict\",\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[[\"workspaceId\",\"chunkId\",\"modelVersionId\"]],\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"workspaceId\",\"chunkId\",\"modelVersionId\"]}],\"isGenerated\":false},\"SearchIndexTask\":{\"dbName\":\"search_index_tasks\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"workspaceId\",\"dbName\":\"workspace_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"researchObjectId\",\"dbName\":\"research_object_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"artifactId\",\"dbName\":\"artifact_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"sourceVersionId\",\"dbName\":\"source_version_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"sourceVersionNo\",\"dbName\":\"source_version_no\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"contentHash\",\"dbName\":\"content_hash\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"modelVersionId\",\"dbName\":\"model_version_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"sourceGenerationSha256\",\"dbName\":\"source_generation_sha256\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"sourceCreatedAt\",\"dbName\":\"source_created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"status\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":\"queued\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"attemptCount\",\"dbName\":\"attempt_count\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Int\",\"default\":0,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"errorCode\",\"dbName\":\"error_code\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"leaseToken\",\"dbName\":\"lease_token\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"fenceOwnerTaskId\",\"dbName\":\"fence_owner_task_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"fenceOwnerCreatedAt\",\"dbName\":\"fence_owner_created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"fenceOwnerAttempt\",\"dbName\":\"fence_owner_attempt\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"leaseExpiresAt\",\"dbName\":\"lease_expires_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isCurrent\",\"dbName\":\"is_current\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"startedAt\",\"dbName\":\"started_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"finishedAt\",\"dbName\":\"finished_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"modelVersion\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"SearchModelVersion\",\"relationName\":\"SearchIndexTaskToSearchModelVersion\",\"relationFromFields\":[\"modelVersionId\"],\"relationToFields\":[\"id\"],\"relationOnDelete\":\"Restrict\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"chunks\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"SearchChunk\",\"relationName\":\"SearchChunkToSearchIndexTask\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[[\"workspaceId\",\"researchObjectId\",\"artifactId\",\"sourceVersionId\",\"contentHash\",\"modelVersionId\",\"sourceGenerationSha256\"]],\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"workspaceId\",\"researchObjectId\",\"artifactId\",\"sourceVersionId\",\"contentHash\",\"modelVersionId\",\"sourceGenerationSha256\"]}],\"isGenerated\":false},\"SearchQueryMetric\":{\"dbName\":\"search_query_metrics\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"workspaceId\",\"dbName\":\"workspace_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"queryHash\",\"dbName\":\"query_hash\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"lexicalAvailable\",\"dbName\":\"lexical_available\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Boolean\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"denseAvailable\",\"dbName\":\"dense_available\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Boolean\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"resultCount\",\"dbName\":\"result_count\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"lexicalLatencyMs\",\"dbName\":\"lexical_latency_ms\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"denseLatencyMs\",\"dbName\":\"dense_latency_ms\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"totalLatencyMs\",\"dbName\":\"total_latency_ms\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"errorCode\",\"dbName\":\"error_code\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false}},\"enums\":{},\"types\":{}}")
defineDmmfProperty(exports.Prisma, config.runtimeDataModel)
config.engineWasm = undefined

config.injectableEdgeEnv = () => ({
  parsed: {
    SEARCH_DATABASE_URL: typeof globalThis !== 'undefined' && globalThis['SEARCH_DATABASE_URL'] || typeof process !== 'undefined' && process.env && process.env.SEARCH_DATABASE_URL || undefined
  }
})

if (typeof globalThis !== 'undefined' && globalThis['DEBUG'] || typeof process !== 'undefined' && process.env && process.env.DEBUG || undefined) {
  Debug.enable(typeof globalThis !== 'undefined' && globalThis['DEBUG'] || typeof process !== 'undefined' && process.env && process.env.DEBUG || undefined)
}

const PrismaClient = getPrismaClient(config)
exports.PrismaClient = PrismaClient
Object.assign(exports, Prisma)

