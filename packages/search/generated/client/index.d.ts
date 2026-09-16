
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model SearchSchemaMeta
 * 
 */
export type SearchSchemaMeta = $Result.DefaultSelection<Prisma.$SearchSchemaMetaPayload>
/**
 * Model SearchModelVersion
 * 
 */
export type SearchModelVersion = $Result.DefaultSelection<Prisma.$SearchModelVersionPayload>
/**
 * Model SearchChunk
 * 
 */
export type SearchChunk = $Result.DefaultSelection<Prisma.$SearchChunkPayload>
/**
 * Model SearchEmbedding
 * 
 */
export type SearchEmbedding = $Result.DefaultSelection<Prisma.$SearchEmbeddingPayload>
/**
 * Model SearchIndexTask
 * 
 */
export type SearchIndexTask = $Result.DefaultSelection<Prisma.$SearchIndexTaskPayload>
/**
 * Model SearchQueryMetric
 * 
 */
export type SearchQueryMetric = $Result.DefaultSelection<Prisma.$SearchQueryMetricPayload>

/**
 * ##  Prisma Client ʲˢ
 * 
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more SearchSchemaMetas
 * const searchSchemaMetas = await prisma.searchSchemaMeta.findMany()
 * ```
 *
 * 
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   * 
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more SearchSchemaMetas
   * const searchSchemaMetas = await prisma.searchSchemaMeta.findMany()
   * ```
   *
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): void;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb, ExtArgs>

      /**
   * `prisma.searchSchemaMeta`: Exposes CRUD operations for the **SearchSchemaMeta** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SearchSchemaMetas
    * const searchSchemaMetas = await prisma.searchSchemaMeta.findMany()
    * ```
    */
  get searchSchemaMeta(): Prisma.SearchSchemaMetaDelegate<ExtArgs>;

  /**
   * `prisma.searchModelVersion`: Exposes CRUD operations for the **SearchModelVersion** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SearchModelVersions
    * const searchModelVersions = await prisma.searchModelVersion.findMany()
    * ```
    */
  get searchModelVersion(): Prisma.SearchModelVersionDelegate<ExtArgs>;

  /**
   * `prisma.searchChunk`: Exposes CRUD operations for the **SearchChunk** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SearchChunks
    * const searchChunks = await prisma.searchChunk.findMany()
    * ```
    */
  get searchChunk(): Prisma.SearchChunkDelegate<ExtArgs>;

  /**
   * `prisma.searchEmbedding`: Exposes CRUD operations for the **SearchEmbedding** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SearchEmbeddings
    * const searchEmbeddings = await prisma.searchEmbedding.findMany()
    * ```
    */
  get searchEmbedding(): Prisma.SearchEmbeddingDelegate<ExtArgs>;

  /**
   * `prisma.searchIndexTask`: Exposes CRUD operations for the **SearchIndexTask** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SearchIndexTasks
    * const searchIndexTasks = await prisma.searchIndexTask.findMany()
    * ```
    */
  get searchIndexTask(): Prisma.SearchIndexTaskDelegate<ExtArgs>;

  /**
   * `prisma.searchQueryMetric`: Exposes CRUD operations for the **SearchQueryMetric** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SearchQueryMetrics
    * const searchQueryMetrics = await prisma.searchQueryMetric.findMany()
    * ```
    */
  get searchQueryMetric(): Prisma.SearchQueryMetricDelegate<ExtArgs>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError
  export import NotFoundError = runtime.NotFoundError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics 
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 5.22.0
   * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion 

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? K : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    SearchSchemaMeta: 'SearchSchemaMeta',
    SearchModelVersion: 'SearchModelVersion',
    SearchChunk: 'SearchChunk',
    SearchEmbedding: 'SearchEmbedding',
    SearchIndexTask: 'SearchIndexTask',
    SearchQueryMetric: 'SearchQueryMetric'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    search?: Datasource
  }

  interface TypeMapCb extends $Utils.Fn<{extArgs: $Extensions.InternalArgs, clientOptions: PrismaClientOptions }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], this['params']['clientOptions']>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> = {
    meta: {
      modelProps: "searchSchemaMeta" | "searchModelVersion" | "searchChunk" | "searchEmbedding" | "searchIndexTask" | "searchQueryMetric"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      SearchSchemaMeta: {
        payload: Prisma.$SearchSchemaMetaPayload<ExtArgs>
        fields: Prisma.SearchSchemaMetaFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SearchSchemaMetaFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchSchemaMetaPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SearchSchemaMetaFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchSchemaMetaPayload>
          }
          findFirst: {
            args: Prisma.SearchSchemaMetaFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchSchemaMetaPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SearchSchemaMetaFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchSchemaMetaPayload>
          }
          findMany: {
            args: Prisma.SearchSchemaMetaFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchSchemaMetaPayload>[]
          }
          create: {
            args: Prisma.SearchSchemaMetaCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchSchemaMetaPayload>
          }
          createMany: {
            args: Prisma.SearchSchemaMetaCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SearchSchemaMetaCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchSchemaMetaPayload>[]
          }
          delete: {
            args: Prisma.SearchSchemaMetaDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchSchemaMetaPayload>
          }
          update: {
            args: Prisma.SearchSchemaMetaUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchSchemaMetaPayload>
          }
          deleteMany: {
            args: Prisma.SearchSchemaMetaDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SearchSchemaMetaUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.SearchSchemaMetaUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchSchemaMetaPayload>
          }
          aggregate: {
            args: Prisma.SearchSchemaMetaAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSearchSchemaMeta>
          }
          groupBy: {
            args: Prisma.SearchSchemaMetaGroupByArgs<ExtArgs>
            result: $Utils.Optional<SearchSchemaMetaGroupByOutputType>[]
          }
          count: {
            args: Prisma.SearchSchemaMetaCountArgs<ExtArgs>
            result: $Utils.Optional<SearchSchemaMetaCountAggregateOutputType> | number
          }
        }
      }
      SearchModelVersion: {
        payload: Prisma.$SearchModelVersionPayload<ExtArgs>
        fields: Prisma.SearchModelVersionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SearchModelVersionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchModelVersionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SearchModelVersionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchModelVersionPayload>
          }
          findFirst: {
            args: Prisma.SearchModelVersionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchModelVersionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SearchModelVersionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchModelVersionPayload>
          }
          findMany: {
            args: Prisma.SearchModelVersionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchModelVersionPayload>[]
          }
          create: {
            args: Prisma.SearchModelVersionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchModelVersionPayload>
          }
          createMany: {
            args: Prisma.SearchModelVersionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SearchModelVersionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchModelVersionPayload>[]
          }
          delete: {
            args: Prisma.SearchModelVersionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchModelVersionPayload>
          }
          update: {
            args: Prisma.SearchModelVersionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchModelVersionPayload>
          }
          deleteMany: {
            args: Prisma.SearchModelVersionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SearchModelVersionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.SearchModelVersionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchModelVersionPayload>
          }
          aggregate: {
            args: Prisma.SearchModelVersionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSearchModelVersion>
          }
          groupBy: {
            args: Prisma.SearchModelVersionGroupByArgs<ExtArgs>
            result: $Utils.Optional<SearchModelVersionGroupByOutputType>[]
          }
          count: {
            args: Prisma.SearchModelVersionCountArgs<ExtArgs>
            result: $Utils.Optional<SearchModelVersionCountAggregateOutputType> | number
          }
        }
      }
      SearchChunk: {
        payload: Prisma.$SearchChunkPayload<ExtArgs>
        fields: Prisma.SearchChunkFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SearchChunkFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchChunkPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SearchChunkFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchChunkPayload>
          }
          findFirst: {
            args: Prisma.SearchChunkFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchChunkPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SearchChunkFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchChunkPayload>
          }
          findMany: {
            args: Prisma.SearchChunkFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchChunkPayload>[]
          }
          create: {
            args: Prisma.SearchChunkCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchChunkPayload>
          }
          createMany: {
            args: Prisma.SearchChunkCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SearchChunkCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchChunkPayload>[]
          }
          delete: {
            args: Prisma.SearchChunkDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchChunkPayload>
          }
          update: {
            args: Prisma.SearchChunkUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchChunkPayload>
          }
          deleteMany: {
            args: Prisma.SearchChunkDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SearchChunkUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.SearchChunkUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchChunkPayload>
          }
          aggregate: {
            args: Prisma.SearchChunkAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSearchChunk>
          }
          groupBy: {
            args: Prisma.SearchChunkGroupByArgs<ExtArgs>
            result: $Utils.Optional<SearchChunkGroupByOutputType>[]
          }
          count: {
            args: Prisma.SearchChunkCountArgs<ExtArgs>
            result: $Utils.Optional<SearchChunkCountAggregateOutputType> | number
          }
        }
      }
      SearchEmbedding: {
        payload: Prisma.$SearchEmbeddingPayload<ExtArgs>
        fields: Prisma.SearchEmbeddingFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SearchEmbeddingFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchEmbeddingPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SearchEmbeddingFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchEmbeddingPayload>
          }
          findFirst: {
            args: Prisma.SearchEmbeddingFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchEmbeddingPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SearchEmbeddingFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchEmbeddingPayload>
          }
          findMany: {
            args: Prisma.SearchEmbeddingFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchEmbeddingPayload>[]
          }
          create: {
            args: Prisma.SearchEmbeddingCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchEmbeddingPayload>
          }
          createMany: {
            args: Prisma.SearchEmbeddingCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SearchEmbeddingCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchEmbeddingPayload>[]
          }
          delete: {
            args: Prisma.SearchEmbeddingDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchEmbeddingPayload>
          }
          update: {
            args: Prisma.SearchEmbeddingUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchEmbeddingPayload>
          }
          deleteMany: {
            args: Prisma.SearchEmbeddingDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SearchEmbeddingUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.SearchEmbeddingUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchEmbeddingPayload>
          }
          aggregate: {
            args: Prisma.SearchEmbeddingAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSearchEmbedding>
          }
          groupBy: {
            args: Prisma.SearchEmbeddingGroupByArgs<ExtArgs>
            result: $Utils.Optional<SearchEmbeddingGroupByOutputType>[]
          }
          count: {
            args: Prisma.SearchEmbeddingCountArgs<ExtArgs>
            result: $Utils.Optional<SearchEmbeddingCountAggregateOutputType> | number
          }
        }
      }
      SearchIndexTask: {
        payload: Prisma.$SearchIndexTaskPayload<ExtArgs>
        fields: Prisma.SearchIndexTaskFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SearchIndexTaskFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchIndexTaskPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SearchIndexTaskFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchIndexTaskPayload>
          }
          findFirst: {
            args: Prisma.SearchIndexTaskFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchIndexTaskPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SearchIndexTaskFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchIndexTaskPayload>
          }
          findMany: {
            args: Prisma.SearchIndexTaskFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchIndexTaskPayload>[]
          }
          create: {
            args: Prisma.SearchIndexTaskCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchIndexTaskPayload>
          }
          createMany: {
            args: Prisma.SearchIndexTaskCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SearchIndexTaskCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchIndexTaskPayload>[]
          }
          delete: {
            args: Prisma.SearchIndexTaskDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchIndexTaskPayload>
          }
          update: {
            args: Prisma.SearchIndexTaskUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchIndexTaskPayload>
          }
          deleteMany: {
            args: Prisma.SearchIndexTaskDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SearchIndexTaskUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.SearchIndexTaskUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchIndexTaskPayload>
          }
          aggregate: {
            args: Prisma.SearchIndexTaskAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSearchIndexTask>
          }
          groupBy: {
            args: Prisma.SearchIndexTaskGroupByArgs<ExtArgs>
            result: $Utils.Optional<SearchIndexTaskGroupByOutputType>[]
          }
          count: {
            args: Prisma.SearchIndexTaskCountArgs<ExtArgs>
            result: $Utils.Optional<SearchIndexTaskCountAggregateOutputType> | number
          }
        }
      }
      SearchQueryMetric: {
        payload: Prisma.$SearchQueryMetricPayload<ExtArgs>
        fields: Prisma.SearchQueryMetricFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SearchQueryMetricFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchQueryMetricPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SearchQueryMetricFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchQueryMetricPayload>
          }
          findFirst: {
            args: Prisma.SearchQueryMetricFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchQueryMetricPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SearchQueryMetricFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchQueryMetricPayload>
          }
          findMany: {
            args: Prisma.SearchQueryMetricFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchQueryMetricPayload>[]
          }
          create: {
            args: Prisma.SearchQueryMetricCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchQueryMetricPayload>
          }
          createMany: {
            args: Prisma.SearchQueryMetricCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SearchQueryMetricCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchQueryMetricPayload>[]
          }
          delete: {
            args: Prisma.SearchQueryMetricDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchQueryMetricPayload>
          }
          update: {
            args: Prisma.SearchQueryMetricUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchQueryMetricPayload>
          }
          deleteMany: {
            args: Prisma.SearchQueryMetricDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SearchQueryMetricUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.SearchQueryMetricUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SearchQueryMetricPayload>
          }
          aggregate: {
            args: Prisma.SearchQueryMetricAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSearchQueryMetric>
          }
          groupBy: {
            args: Prisma.SearchQueryMetricGroupByArgs<ExtArgs>
            result: $Utils.Optional<SearchQueryMetricGroupByOutputType>[]
          }
          count: {
            args: Prisma.SearchQueryMetricCountArgs<ExtArgs>
            result: $Utils.Optional<SearchQueryMetricCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
  }


  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type SearchModelVersionCountOutputType
   */

  export type SearchModelVersionCountOutputType = {
    embeddings: number
    indexTasks: number
  }

  export type SearchModelVersionCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    embeddings?: boolean | SearchModelVersionCountOutputTypeCountEmbeddingsArgs
    indexTasks?: boolean | SearchModelVersionCountOutputTypeCountIndexTasksArgs
  }

  // Custom InputTypes
  /**
   * SearchModelVersionCountOutputType without action
   */
  export type SearchModelVersionCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchModelVersionCountOutputType
     */
    select?: SearchModelVersionCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * SearchModelVersionCountOutputType without action
   */
  export type SearchModelVersionCountOutputTypeCountEmbeddingsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SearchEmbeddingWhereInput
  }

  /**
   * SearchModelVersionCountOutputType without action
   */
  export type SearchModelVersionCountOutputTypeCountIndexTasksArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SearchIndexTaskWhereInput
  }


  /**
   * Count Type SearchChunkCountOutputType
   */

  export type SearchChunkCountOutputType = {
    embeddings: number
  }

  export type SearchChunkCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    embeddings?: boolean | SearchChunkCountOutputTypeCountEmbeddingsArgs
  }

  // Custom InputTypes
  /**
   * SearchChunkCountOutputType without action
   */
  export type SearchChunkCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchChunkCountOutputType
     */
    select?: SearchChunkCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * SearchChunkCountOutputType without action
   */
  export type SearchChunkCountOutputTypeCountEmbeddingsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SearchEmbeddingWhereInput
  }


  /**
   * Count Type SearchIndexTaskCountOutputType
   */

  export type SearchIndexTaskCountOutputType = {
    chunks: number
  }

  export type SearchIndexTaskCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    chunks?: boolean | SearchIndexTaskCountOutputTypeCountChunksArgs
  }

  // Custom InputTypes
  /**
   * SearchIndexTaskCountOutputType without action
   */
  export type SearchIndexTaskCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTaskCountOutputType
     */
    select?: SearchIndexTaskCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * SearchIndexTaskCountOutputType without action
   */
  export type SearchIndexTaskCountOutputTypeCountChunksArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SearchChunkWhereInput
  }


  /**
   * Models
   */

  /**
   * Model SearchSchemaMeta
   */

  export type AggregateSearchSchemaMeta = {
    _count: SearchSchemaMetaCountAggregateOutputType | null
    _min: SearchSchemaMetaMinAggregateOutputType | null
    _max: SearchSchemaMetaMaxAggregateOutputType | null
  }

  export type SearchSchemaMetaMinAggregateOutputType = {
    key: string | null
    updatedAt: Date | null
  }

  export type SearchSchemaMetaMaxAggregateOutputType = {
    key: string | null
    updatedAt: Date | null
  }

  export type SearchSchemaMetaCountAggregateOutputType = {
    key: number
    value: number
    updatedAt: number
    _all: number
  }


  export type SearchSchemaMetaMinAggregateInputType = {
    key?: true
    updatedAt?: true
  }

  export type SearchSchemaMetaMaxAggregateInputType = {
    key?: true
    updatedAt?: true
  }

  export type SearchSchemaMetaCountAggregateInputType = {
    key?: true
    value?: true
    updatedAt?: true
    _all?: true
  }

  export type SearchSchemaMetaAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SearchSchemaMeta to aggregate.
     */
    where?: SearchSchemaMetaWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchSchemaMetas to fetch.
     */
    orderBy?: SearchSchemaMetaOrderByWithRelationInput | SearchSchemaMetaOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SearchSchemaMetaWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchSchemaMetas from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchSchemaMetas.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SearchSchemaMetas
    **/
    _count?: true | SearchSchemaMetaCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SearchSchemaMetaMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SearchSchemaMetaMaxAggregateInputType
  }

  export type GetSearchSchemaMetaAggregateType<T extends SearchSchemaMetaAggregateArgs> = {
        [P in keyof T & keyof AggregateSearchSchemaMeta]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSearchSchemaMeta[P]>
      : GetScalarType<T[P], AggregateSearchSchemaMeta[P]>
  }




  export type SearchSchemaMetaGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SearchSchemaMetaWhereInput
    orderBy?: SearchSchemaMetaOrderByWithAggregationInput | SearchSchemaMetaOrderByWithAggregationInput[]
    by: SearchSchemaMetaScalarFieldEnum[] | SearchSchemaMetaScalarFieldEnum
    having?: SearchSchemaMetaScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SearchSchemaMetaCountAggregateInputType | true
    _min?: SearchSchemaMetaMinAggregateInputType
    _max?: SearchSchemaMetaMaxAggregateInputType
  }

  export type SearchSchemaMetaGroupByOutputType = {
    key: string
    value: JsonValue
    updatedAt: Date
    _count: SearchSchemaMetaCountAggregateOutputType | null
    _min: SearchSchemaMetaMinAggregateOutputType | null
    _max: SearchSchemaMetaMaxAggregateOutputType | null
  }

  type GetSearchSchemaMetaGroupByPayload<T extends SearchSchemaMetaGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SearchSchemaMetaGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SearchSchemaMetaGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SearchSchemaMetaGroupByOutputType[P]>
            : GetScalarType<T[P], SearchSchemaMetaGroupByOutputType[P]>
        }
      >
    >


  export type SearchSchemaMetaSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    key?: boolean
    value?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["searchSchemaMeta"]>

  export type SearchSchemaMetaSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    key?: boolean
    value?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["searchSchemaMeta"]>

  export type SearchSchemaMetaSelectScalar = {
    key?: boolean
    value?: boolean
    updatedAt?: boolean
  }


  export type $SearchSchemaMetaPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SearchSchemaMeta"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      key: string
      value: Prisma.JsonValue
      updatedAt: Date
    }, ExtArgs["result"]["searchSchemaMeta"]>
    composites: {}
  }

  type SearchSchemaMetaGetPayload<S extends boolean | null | undefined | SearchSchemaMetaDefaultArgs> = $Result.GetResult<Prisma.$SearchSchemaMetaPayload, S>

  type SearchSchemaMetaCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<SearchSchemaMetaFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: SearchSchemaMetaCountAggregateInputType | true
    }

  export interface SearchSchemaMetaDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SearchSchemaMeta'], meta: { name: 'SearchSchemaMeta' } }
    /**
     * Find zero or one SearchSchemaMeta that matches the filter.
     * @param {SearchSchemaMetaFindUniqueArgs} args - Arguments to find a SearchSchemaMeta
     * @example
     * // Get one SearchSchemaMeta
     * const searchSchemaMeta = await prisma.searchSchemaMeta.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SearchSchemaMetaFindUniqueArgs>(args: SelectSubset<T, SearchSchemaMetaFindUniqueArgs<ExtArgs>>): Prisma__SearchSchemaMetaClient<$Result.GetResult<Prisma.$SearchSchemaMetaPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one SearchSchemaMeta that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {SearchSchemaMetaFindUniqueOrThrowArgs} args - Arguments to find a SearchSchemaMeta
     * @example
     * // Get one SearchSchemaMeta
     * const searchSchemaMeta = await prisma.searchSchemaMeta.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SearchSchemaMetaFindUniqueOrThrowArgs>(args: SelectSubset<T, SearchSchemaMetaFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SearchSchemaMetaClient<$Result.GetResult<Prisma.$SearchSchemaMetaPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first SearchSchemaMeta that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchSchemaMetaFindFirstArgs} args - Arguments to find a SearchSchemaMeta
     * @example
     * // Get one SearchSchemaMeta
     * const searchSchemaMeta = await prisma.searchSchemaMeta.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SearchSchemaMetaFindFirstArgs>(args?: SelectSubset<T, SearchSchemaMetaFindFirstArgs<ExtArgs>>): Prisma__SearchSchemaMetaClient<$Result.GetResult<Prisma.$SearchSchemaMetaPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first SearchSchemaMeta that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchSchemaMetaFindFirstOrThrowArgs} args - Arguments to find a SearchSchemaMeta
     * @example
     * // Get one SearchSchemaMeta
     * const searchSchemaMeta = await prisma.searchSchemaMeta.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SearchSchemaMetaFindFirstOrThrowArgs>(args?: SelectSubset<T, SearchSchemaMetaFindFirstOrThrowArgs<ExtArgs>>): Prisma__SearchSchemaMetaClient<$Result.GetResult<Prisma.$SearchSchemaMetaPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more SearchSchemaMetas that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchSchemaMetaFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SearchSchemaMetas
     * const searchSchemaMetas = await prisma.searchSchemaMeta.findMany()
     * 
     * // Get first 10 SearchSchemaMetas
     * const searchSchemaMetas = await prisma.searchSchemaMeta.findMany({ take: 10 })
     * 
     * // Only select the `key`
     * const searchSchemaMetaWithKeyOnly = await prisma.searchSchemaMeta.findMany({ select: { key: true } })
     * 
     */
    findMany<T extends SearchSchemaMetaFindManyArgs>(args?: SelectSubset<T, SearchSchemaMetaFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchSchemaMetaPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a SearchSchemaMeta.
     * @param {SearchSchemaMetaCreateArgs} args - Arguments to create a SearchSchemaMeta.
     * @example
     * // Create one SearchSchemaMeta
     * const SearchSchemaMeta = await prisma.searchSchemaMeta.create({
     *   data: {
     *     // ... data to create a SearchSchemaMeta
     *   }
     * })
     * 
     */
    create<T extends SearchSchemaMetaCreateArgs>(args: SelectSubset<T, SearchSchemaMetaCreateArgs<ExtArgs>>): Prisma__SearchSchemaMetaClient<$Result.GetResult<Prisma.$SearchSchemaMetaPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many SearchSchemaMetas.
     * @param {SearchSchemaMetaCreateManyArgs} args - Arguments to create many SearchSchemaMetas.
     * @example
     * // Create many SearchSchemaMetas
     * const searchSchemaMeta = await prisma.searchSchemaMeta.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SearchSchemaMetaCreateManyArgs>(args?: SelectSubset<T, SearchSchemaMetaCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SearchSchemaMetas and returns the data saved in the database.
     * @param {SearchSchemaMetaCreateManyAndReturnArgs} args - Arguments to create many SearchSchemaMetas.
     * @example
     * // Create many SearchSchemaMetas
     * const searchSchemaMeta = await prisma.searchSchemaMeta.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SearchSchemaMetas and only return the `key`
     * const searchSchemaMetaWithKeyOnly = await prisma.searchSchemaMeta.createManyAndReturn({ 
     *   select: { key: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SearchSchemaMetaCreateManyAndReturnArgs>(args?: SelectSubset<T, SearchSchemaMetaCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchSchemaMetaPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a SearchSchemaMeta.
     * @param {SearchSchemaMetaDeleteArgs} args - Arguments to delete one SearchSchemaMeta.
     * @example
     * // Delete one SearchSchemaMeta
     * const SearchSchemaMeta = await prisma.searchSchemaMeta.delete({
     *   where: {
     *     // ... filter to delete one SearchSchemaMeta
     *   }
     * })
     * 
     */
    delete<T extends SearchSchemaMetaDeleteArgs>(args: SelectSubset<T, SearchSchemaMetaDeleteArgs<ExtArgs>>): Prisma__SearchSchemaMetaClient<$Result.GetResult<Prisma.$SearchSchemaMetaPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one SearchSchemaMeta.
     * @param {SearchSchemaMetaUpdateArgs} args - Arguments to update one SearchSchemaMeta.
     * @example
     * // Update one SearchSchemaMeta
     * const searchSchemaMeta = await prisma.searchSchemaMeta.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SearchSchemaMetaUpdateArgs>(args: SelectSubset<T, SearchSchemaMetaUpdateArgs<ExtArgs>>): Prisma__SearchSchemaMetaClient<$Result.GetResult<Prisma.$SearchSchemaMetaPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more SearchSchemaMetas.
     * @param {SearchSchemaMetaDeleteManyArgs} args - Arguments to filter SearchSchemaMetas to delete.
     * @example
     * // Delete a few SearchSchemaMetas
     * const { count } = await prisma.searchSchemaMeta.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SearchSchemaMetaDeleteManyArgs>(args?: SelectSubset<T, SearchSchemaMetaDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SearchSchemaMetas.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchSchemaMetaUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SearchSchemaMetas
     * const searchSchemaMeta = await prisma.searchSchemaMeta.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SearchSchemaMetaUpdateManyArgs>(args: SelectSubset<T, SearchSchemaMetaUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one SearchSchemaMeta.
     * @param {SearchSchemaMetaUpsertArgs} args - Arguments to update or create a SearchSchemaMeta.
     * @example
     * // Update or create a SearchSchemaMeta
     * const searchSchemaMeta = await prisma.searchSchemaMeta.upsert({
     *   create: {
     *     // ... data to create a SearchSchemaMeta
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SearchSchemaMeta we want to update
     *   }
     * })
     */
    upsert<T extends SearchSchemaMetaUpsertArgs>(args: SelectSubset<T, SearchSchemaMetaUpsertArgs<ExtArgs>>): Prisma__SearchSchemaMetaClient<$Result.GetResult<Prisma.$SearchSchemaMetaPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of SearchSchemaMetas.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchSchemaMetaCountArgs} args - Arguments to filter SearchSchemaMetas to count.
     * @example
     * // Count the number of SearchSchemaMetas
     * const count = await prisma.searchSchemaMeta.count({
     *   where: {
     *     // ... the filter for the SearchSchemaMetas we want to count
     *   }
     * })
    **/
    count<T extends SearchSchemaMetaCountArgs>(
      args?: Subset<T, SearchSchemaMetaCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SearchSchemaMetaCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SearchSchemaMeta.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchSchemaMetaAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SearchSchemaMetaAggregateArgs>(args: Subset<T, SearchSchemaMetaAggregateArgs>): Prisma.PrismaPromise<GetSearchSchemaMetaAggregateType<T>>

    /**
     * Group by SearchSchemaMeta.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchSchemaMetaGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SearchSchemaMetaGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SearchSchemaMetaGroupByArgs['orderBy'] }
        : { orderBy?: SearchSchemaMetaGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SearchSchemaMetaGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSearchSchemaMetaGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SearchSchemaMeta model
   */
  readonly fields: SearchSchemaMetaFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SearchSchemaMeta.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SearchSchemaMetaClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SearchSchemaMeta model
   */ 
  interface SearchSchemaMetaFieldRefs {
    readonly key: FieldRef<"SearchSchemaMeta", 'String'>
    readonly value: FieldRef<"SearchSchemaMeta", 'Json'>
    readonly updatedAt: FieldRef<"SearchSchemaMeta", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SearchSchemaMeta findUnique
   */
  export type SearchSchemaMetaFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchSchemaMeta
     */
    select?: SearchSchemaMetaSelect<ExtArgs> | null
    /**
     * Filter, which SearchSchemaMeta to fetch.
     */
    where: SearchSchemaMetaWhereUniqueInput
  }

  /**
   * SearchSchemaMeta findUniqueOrThrow
   */
  export type SearchSchemaMetaFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchSchemaMeta
     */
    select?: SearchSchemaMetaSelect<ExtArgs> | null
    /**
     * Filter, which SearchSchemaMeta to fetch.
     */
    where: SearchSchemaMetaWhereUniqueInput
  }

  /**
   * SearchSchemaMeta findFirst
   */
  export type SearchSchemaMetaFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchSchemaMeta
     */
    select?: SearchSchemaMetaSelect<ExtArgs> | null
    /**
     * Filter, which SearchSchemaMeta to fetch.
     */
    where?: SearchSchemaMetaWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchSchemaMetas to fetch.
     */
    orderBy?: SearchSchemaMetaOrderByWithRelationInput | SearchSchemaMetaOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SearchSchemaMetas.
     */
    cursor?: SearchSchemaMetaWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchSchemaMetas from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchSchemaMetas.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SearchSchemaMetas.
     */
    distinct?: SearchSchemaMetaScalarFieldEnum | SearchSchemaMetaScalarFieldEnum[]
  }

  /**
   * SearchSchemaMeta findFirstOrThrow
   */
  export type SearchSchemaMetaFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchSchemaMeta
     */
    select?: SearchSchemaMetaSelect<ExtArgs> | null
    /**
     * Filter, which SearchSchemaMeta to fetch.
     */
    where?: SearchSchemaMetaWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchSchemaMetas to fetch.
     */
    orderBy?: SearchSchemaMetaOrderByWithRelationInput | SearchSchemaMetaOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SearchSchemaMetas.
     */
    cursor?: SearchSchemaMetaWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchSchemaMetas from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchSchemaMetas.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SearchSchemaMetas.
     */
    distinct?: SearchSchemaMetaScalarFieldEnum | SearchSchemaMetaScalarFieldEnum[]
  }

  /**
   * SearchSchemaMeta findMany
   */
  export type SearchSchemaMetaFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchSchemaMeta
     */
    select?: SearchSchemaMetaSelect<ExtArgs> | null
    /**
     * Filter, which SearchSchemaMetas to fetch.
     */
    where?: SearchSchemaMetaWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchSchemaMetas to fetch.
     */
    orderBy?: SearchSchemaMetaOrderByWithRelationInput | SearchSchemaMetaOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SearchSchemaMetas.
     */
    cursor?: SearchSchemaMetaWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchSchemaMetas from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchSchemaMetas.
     */
    skip?: number
    distinct?: SearchSchemaMetaScalarFieldEnum | SearchSchemaMetaScalarFieldEnum[]
  }

  /**
   * SearchSchemaMeta create
   */
  export type SearchSchemaMetaCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchSchemaMeta
     */
    select?: SearchSchemaMetaSelect<ExtArgs> | null
    /**
     * The data needed to create a SearchSchemaMeta.
     */
    data: XOR<SearchSchemaMetaCreateInput, SearchSchemaMetaUncheckedCreateInput>
  }

  /**
   * SearchSchemaMeta createMany
   */
  export type SearchSchemaMetaCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SearchSchemaMetas.
     */
    data: SearchSchemaMetaCreateManyInput | SearchSchemaMetaCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SearchSchemaMeta createManyAndReturn
   */
  export type SearchSchemaMetaCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchSchemaMeta
     */
    select?: SearchSchemaMetaSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many SearchSchemaMetas.
     */
    data: SearchSchemaMetaCreateManyInput | SearchSchemaMetaCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SearchSchemaMeta update
   */
  export type SearchSchemaMetaUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchSchemaMeta
     */
    select?: SearchSchemaMetaSelect<ExtArgs> | null
    /**
     * The data needed to update a SearchSchemaMeta.
     */
    data: XOR<SearchSchemaMetaUpdateInput, SearchSchemaMetaUncheckedUpdateInput>
    /**
     * Choose, which SearchSchemaMeta to update.
     */
    where: SearchSchemaMetaWhereUniqueInput
  }

  /**
   * SearchSchemaMeta updateMany
   */
  export type SearchSchemaMetaUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SearchSchemaMetas.
     */
    data: XOR<SearchSchemaMetaUpdateManyMutationInput, SearchSchemaMetaUncheckedUpdateManyInput>
    /**
     * Filter which SearchSchemaMetas to update
     */
    where?: SearchSchemaMetaWhereInput
  }

  /**
   * SearchSchemaMeta upsert
   */
  export type SearchSchemaMetaUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchSchemaMeta
     */
    select?: SearchSchemaMetaSelect<ExtArgs> | null
    /**
     * The filter to search for the SearchSchemaMeta to update in case it exists.
     */
    where: SearchSchemaMetaWhereUniqueInput
    /**
     * In case the SearchSchemaMeta found by the `where` argument doesn't exist, create a new SearchSchemaMeta with this data.
     */
    create: XOR<SearchSchemaMetaCreateInput, SearchSchemaMetaUncheckedCreateInput>
    /**
     * In case the SearchSchemaMeta was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SearchSchemaMetaUpdateInput, SearchSchemaMetaUncheckedUpdateInput>
  }

  /**
   * SearchSchemaMeta delete
   */
  export type SearchSchemaMetaDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchSchemaMeta
     */
    select?: SearchSchemaMetaSelect<ExtArgs> | null
    /**
     * Filter which SearchSchemaMeta to delete.
     */
    where: SearchSchemaMetaWhereUniqueInput
  }

  /**
   * SearchSchemaMeta deleteMany
   */
  export type SearchSchemaMetaDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SearchSchemaMetas to delete
     */
    where?: SearchSchemaMetaWhereInput
  }

  /**
   * SearchSchemaMeta without action
   */
  export type SearchSchemaMetaDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchSchemaMeta
     */
    select?: SearchSchemaMetaSelect<ExtArgs> | null
  }


  /**
   * Model SearchModelVersion
   */

  export type AggregateSearchModelVersion = {
    _count: SearchModelVersionCountAggregateOutputType | null
    _avg: SearchModelVersionAvgAggregateOutputType | null
    _sum: SearchModelVersionSumAggregateOutputType | null
    _min: SearchModelVersionMinAggregateOutputType | null
    _max: SearchModelVersionMaxAggregateOutputType | null
  }

  export type SearchModelVersionAvgAggregateOutputType = {
    dimension: number | null
  }

  export type SearchModelVersionSumAggregateOutputType = {
    dimension: number | null
  }

  export type SearchModelVersionMinAggregateOutputType = {
    id: string | null
    provider: string | null
    model: string | null
    revision: string | null
    dimension: number | null
    sourceSha256: string | null
    packageFreezeSha256: string | null
    modelManifestSha256: string | null
    status: string | null
    createdAt: Date | null
    retiredAt: Date | null
  }

  export type SearchModelVersionMaxAggregateOutputType = {
    id: string | null
    provider: string | null
    model: string | null
    revision: string | null
    dimension: number | null
    sourceSha256: string | null
    packageFreezeSha256: string | null
    modelManifestSha256: string | null
    status: string | null
    createdAt: Date | null
    retiredAt: Date | null
  }

  export type SearchModelVersionCountAggregateOutputType = {
    id: number
    provider: number
    model: number
    revision: number
    dimension: number
    sourceSha256: number
    packageFreezeSha256: number
    modelManifestSha256: number
    status: number
    createdAt: number
    retiredAt: number
    _all: number
  }


  export type SearchModelVersionAvgAggregateInputType = {
    dimension?: true
  }

  export type SearchModelVersionSumAggregateInputType = {
    dimension?: true
  }

  export type SearchModelVersionMinAggregateInputType = {
    id?: true
    provider?: true
    model?: true
    revision?: true
    dimension?: true
    sourceSha256?: true
    packageFreezeSha256?: true
    modelManifestSha256?: true
    status?: true
    createdAt?: true
    retiredAt?: true
  }

  export type SearchModelVersionMaxAggregateInputType = {
    id?: true
    provider?: true
    model?: true
    revision?: true
    dimension?: true
    sourceSha256?: true
    packageFreezeSha256?: true
    modelManifestSha256?: true
    status?: true
    createdAt?: true
    retiredAt?: true
  }

  export type SearchModelVersionCountAggregateInputType = {
    id?: true
    provider?: true
    model?: true
    revision?: true
    dimension?: true
    sourceSha256?: true
    packageFreezeSha256?: true
    modelManifestSha256?: true
    status?: true
    createdAt?: true
    retiredAt?: true
    _all?: true
  }

  export type SearchModelVersionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SearchModelVersion to aggregate.
     */
    where?: SearchModelVersionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchModelVersions to fetch.
     */
    orderBy?: SearchModelVersionOrderByWithRelationInput | SearchModelVersionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SearchModelVersionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchModelVersions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchModelVersions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SearchModelVersions
    **/
    _count?: true | SearchModelVersionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SearchModelVersionAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SearchModelVersionSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SearchModelVersionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SearchModelVersionMaxAggregateInputType
  }

  export type GetSearchModelVersionAggregateType<T extends SearchModelVersionAggregateArgs> = {
        [P in keyof T & keyof AggregateSearchModelVersion]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSearchModelVersion[P]>
      : GetScalarType<T[P], AggregateSearchModelVersion[P]>
  }




  export type SearchModelVersionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SearchModelVersionWhereInput
    orderBy?: SearchModelVersionOrderByWithAggregationInput | SearchModelVersionOrderByWithAggregationInput[]
    by: SearchModelVersionScalarFieldEnum[] | SearchModelVersionScalarFieldEnum
    having?: SearchModelVersionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SearchModelVersionCountAggregateInputType | true
    _avg?: SearchModelVersionAvgAggregateInputType
    _sum?: SearchModelVersionSumAggregateInputType
    _min?: SearchModelVersionMinAggregateInputType
    _max?: SearchModelVersionMaxAggregateInputType
  }

  export type SearchModelVersionGroupByOutputType = {
    id: string
    provider: string
    model: string
    revision: string
    dimension: number
    sourceSha256: string
    packageFreezeSha256: string
    modelManifestSha256: string
    status: string
    createdAt: Date
    retiredAt: Date | null
    _count: SearchModelVersionCountAggregateOutputType | null
    _avg: SearchModelVersionAvgAggregateOutputType | null
    _sum: SearchModelVersionSumAggregateOutputType | null
    _min: SearchModelVersionMinAggregateOutputType | null
    _max: SearchModelVersionMaxAggregateOutputType | null
  }

  type GetSearchModelVersionGroupByPayload<T extends SearchModelVersionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SearchModelVersionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SearchModelVersionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SearchModelVersionGroupByOutputType[P]>
            : GetScalarType<T[P], SearchModelVersionGroupByOutputType[P]>
        }
      >
    >


  export type SearchModelVersionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    provider?: boolean
    model?: boolean
    revision?: boolean
    dimension?: boolean
    sourceSha256?: boolean
    packageFreezeSha256?: boolean
    modelManifestSha256?: boolean
    status?: boolean
    createdAt?: boolean
    retiredAt?: boolean
    embeddings?: boolean | SearchModelVersion$embeddingsArgs<ExtArgs>
    indexTasks?: boolean | SearchModelVersion$indexTasksArgs<ExtArgs>
    _count?: boolean | SearchModelVersionCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["searchModelVersion"]>

  export type SearchModelVersionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    provider?: boolean
    model?: boolean
    revision?: boolean
    dimension?: boolean
    sourceSha256?: boolean
    packageFreezeSha256?: boolean
    modelManifestSha256?: boolean
    status?: boolean
    createdAt?: boolean
    retiredAt?: boolean
  }, ExtArgs["result"]["searchModelVersion"]>

  export type SearchModelVersionSelectScalar = {
    id?: boolean
    provider?: boolean
    model?: boolean
    revision?: boolean
    dimension?: boolean
    sourceSha256?: boolean
    packageFreezeSha256?: boolean
    modelManifestSha256?: boolean
    status?: boolean
    createdAt?: boolean
    retiredAt?: boolean
  }

  export type SearchModelVersionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    embeddings?: boolean | SearchModelVersion$embeddingsArgs<ExtArgs>
    indexTasks?: boolean | SearchModelVersion$indexTasksArgs<ExtArgs>
    _count?: boolean | SearchModelVersionCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type SearchModelVersionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $SearchModelVersionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SearchModelVersion"
    objects: {
      embeddings: Prisma.$SearchEmbeddingPayload<ExtArgs>[]
      indexTasks: Prisma.$SearchIndexTaskPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      provider: string
      model: string
      revision: string
      dimension: number
      sourceSha256: string
      packageFreezeSha256: string
      modelManifestSha256: string
      status: string
      createdAt: Date
      retiredAt: Date | null
    }, ExtArgs["result"]["searchModelVersion"]>
    composites: {}
  }

  type SearchModelVersionGetPayload<S extends boolean | null | undefined | SearchModelVersionDefaultArgs> = $Result.GetResult<Prisma.$SearchModelVersionPayload, S>

  type SearchModelVersionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<SearchModelVersionFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: SearchModelVersionCountAggregateInputType | true
    }

  export interface SearchModelVersionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SearchModelVersion'], meta: { name: 'SearchModelVersion' } }
    /**
     * Find zero or one SearchModelVersion that matches the filter.
     * @param {SearchModelVersionFindUniqueArgs} args - Arguments to find a SearchModelVersion
     * @example
     * // Get one SearchModelVersion
     * const searchModelVersion = await prisma.searchModelVersion.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SearchModelVersionFindUniqueArgs>(args: SelectSubset<T, SearchModelVersionFindUniqueArgs<ExtArgs>>): Prisma__SearchModelVersionClient<$Result.GetResult<Prisma.$SearchModelVersionPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one SearchModelVersion that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {SearchModelVersionFindUniqueOrThrowArgs} args - Arguments to find a SearchModelVersion
     * @example
     * // Get one SearchModelVersion
     * const searchModelVersion = await prisma.searchModelVersion.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SearchModelVersionFindUniqueOrThrowArgs>(args: SelectSubset<T, SearchModelVersionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SearchModelVersionClient<$Result.GetResult<Prisma.$SearchModelVersionPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first SearchModelVersion that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchModelVersionFindFirstArgs} args - Arguments to find a SearchModelVersion
     * @example
     * // Get one SearchModelVersion
     * const searchModelVersion = await prisma.searchModelVersion.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SearchModelVersionFindFirstArgs>(args?: SelectSubset<T, SearchModelVersionFindFirstArgs<ExtArgs>>): Prisma__SearchModelVersionClient<$Result.GetResult<Prisma.$SearchModelVersionPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first SearchModelVersion that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchModelVersionFindFirstOrThrowArgs} args - Arguments to find a SearchModelVersion
     * @example
     * // Get one SearchModelVersion
     * const searchModelVersion = await prisma.searchModelVersion.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SearchModelVersionFindFirstOrThrowArgs>(args?: SelectSubset<T, SearchModelVersionFindFirstOrThrowArgs<ExtArgs>>): Prisma__SearchModelVersionClient<$Result.GetResult<Prisma.$SearchModelVersionPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more SearchModelVersions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchModelVersionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SearchModelVersions
     * const searchModelVersions = await prisma.searchModelVersion.findMany()
     * 
     * // Get first 10 SearchModelVersions
     * const searchModelVersions = await prisma.searchModelVersion.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const searchModelVersionWithIdOnly = await prisma.searchModelVersion.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SearchModelVersionFindManyArgs>(args?: SelectSubset<T, SearchModelVersionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchModelVersionPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a SearchModelVersion.
     * @param {SearchModelVersionCreateArgs} args - Arguments to create a SearchModelVersion.
     * @example
     * // Create one SearchModelVersion
     * const SearchModelVersion = await prisma.searchModelVersion.create({
     *   data: {
     *     // ... data to create a SearchModelVersion
     *   }
     * })
     * 
     */
    create<T extends SearchModelVersionCreateArgs>(args: SelectSubset<T, SearchModelVersionCreateArgs<ExtArgs>>): Prisma__SearchModelVersionClient<$Result.GetResult<Prisma.$SearchModelVersionPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many SearchModelVersions.
     * @param {SearchModelVersionCreateManyArgs} args - Arguments to create many SearchModelVersions.
     * @example
     * // Create many SearchModelVersions
     * const searchModelVersion = await prisma.searchModelVersion.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SearchModelVersionCreateManyArgs>(args?: SelectSubset<T, SearchModelVersionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SearchModelVersions and returns the data saved in the database.
     * @param {SearchModelVersionCreateManyAndReturnArgs} args - Arguments to create many SearchModelVersions.
     * @example
     * // Create many SearchModelVersions
     * const searchModelVersion = await prisma.searchModelVersion.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SearchModelVersions and only return the `id`
     * const searchModelVersionWithIdOnly = await prisma.searchModelVersion.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SearchModelVersionCreateManyAndReturnArgs>(args?: SelectSubset<T, SearchModelVersionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchModelVersionPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a SearchModelVersion.
     * @param {SearchModelVersionDeleteArgs} args - Arguments to delete one SearchModelVersion.
     * @example
     * // Delete one SearchModelVersion
     * const SearchModelVersion = await prisma.searchModelVersion.delete({
     *   where: {
     *     // ... filter to delete one SearchModelVersion
     *   }
     * })
     * 
     */
    delete<T extends SearchModelVersionDeleteArgs>(args: SelectSubset<T, SearchModelVersionDeleteArgs<ExtArgs>>): Prisma__SearchModelVersionClient<$Result.GetResult<Prisma.$SearchModelVersionPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one SearchModelVersion.
     * @param {SearchModelVersionUpdateArgs} args - Arguments to update one SearchModelVersion.
     * @example
     * // Update one SearchModelVersion
     * const searchModelVersion = await prisma.searchModelVersion.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SearchModelVersionUpdateArgs>(args: SelectSubset<T, SearchModelVersionUpdateArgs<ExtArgs>>): Prisma__SearchModelVersionClient<$Result.GetResult<Prisma.$SearchModelVersionPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more SearchModelVersions.
     * @param {SearchModelVersionDeleteManyArgs} args - Arguments to filter SearchModelVersions to delete.
     * @example
     * // Delete a few SearchModelVersions
     * const { count } = await prisma.searchModelVersion.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SearchModelVersionDeleteManyArgs>(args?: SelectSubset<T, SearchModelVersionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SearchModelVersions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchModelVersionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SearchModelVersions
     * const searchModelVersion = await prisma.searchModelVersion.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SearchModelVersionUpdateManyArgs>(args: SelectSubset<T, SearchModelVersionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one SearchModelVersion.
     * @param {SearchModelVersionUpsertArgs} args - Arguments to update or create a SearchModelVersion.
     * @example
     * // Update or create a SearchModelVersion
     * const searchModelVersion = await prisma.searchModelVersion.upsert({
     *   create: {
     *     // ... data to create a SearchModelVersion
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SearchModelVersion we want to update
     *   }
     * })
     */
    upsert<T extends SearchModelVersionUpsertArgs>(args: SelectSubset<T, SearchModelVersionUpsertArgs<ExtArgs>>): Prisma__SearchModelVersionClient<$Result.GetResult<Prisma.$SearchModelVersionPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of SearchModelVersions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchModelVersionCountArgs} args - Arguments to filter SearchModelVersions to count.
     * @example
     * // Count the number of SearchModelVersions
     * const count = await prisma.searchModelVersion.count({
     *   where: {
     *     // ... the filter for the SearchModelVersions we want to count
     *   }
     * })
    **/
    count<T extends SearchModelVersionCountArgs>(
      args?: Subset<T, SearchModelVersionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SearchModelVersionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SearchModelVersion.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchModelVersionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SearchModelVersionAggregateArgs>(args: Subset<T, SearchModelVersionAggregateArgs>): Prisma.PrismaPromise<GetSearchModelVersionAggregateType<T>>

    /**
     * Group by SearchModelVersion.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchModelVersionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SearchModelVersionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SearchModelVersionGroupByArgs['orderBy'] }
        : { orderBy?: SearchModelVersionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SearchModelVersionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSearchModelVersionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SearchModelVersion model
   */
  readonly fields: SearchModelVersionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SearchModelVersion.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SearchModelVersionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    embeddings<T extends SearchModelVersion$embeddingsArgs<ExtArgs> = {}>(args?: Subset<T, SearchModelVersion$embeddingsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchEmbeddingPayload<ExtArgs>, T, "findMany"> | Null>
    indexTasks<T extends SearchModelVersion$indexTasksArgs<ExtArgs> = {}>(args?: Subset<T, SearchModelVersion$indexTasksArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchIndexTaskPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SearchModelVersion model
   */ 
  interface SearchModelVersionFieldRefs {
    readonly id: FieldRef<"SearchModelVersion", 'String'>
    readonly provider: FieldRef<"SearchModelVersion", 'String'>
    readonly model: FieldRef<"SearchModelVersion", 'String'>
    readonly revision: FieldRef<"SearchModelVersion", 'String'>
    readonly dimension: FieldRef<"SearchModelVersion", 'Int'>
    readonly sourceSha256: FieldRef<"SearchModelVersion", 'String'>
    readonly packageFreezeSha256: FieldRef<"SearchModelVersion", 'String'>
    readonly modelManifestSha256: FieldRef<"SearchModelVersion", 'String'>
    readonly status: FieldRef<"SearchModelVersion", 'String'>
    readonly createdAt: FieldRef<"SearchModelVersion", 'DateTime'>
    readonly retiredAt: FieldRef<"SearchModelVersion", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SearchModelVersion findUnique
   */
  export type SearchModelVersionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchModelVersion
     */
    select?: SearchModelVersionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchModelVersionInclude<ExtArgs> | null
    /**
     * Filter, which SearchModelVersion to fetch.
     */
    where: SearchModelVersionWhereUniqueInput
  }

  /**
   * SearchModelVersion findUniqueOrThrow
   */
  export type SearchModelVersionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchModelVersion
     */
    select?: SearchModelVersionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchModelVersionInclude<ExtArgs> | null
    /**
     * Filter, which SearchModelVersion to fetch.
     */
    where: SearchModelVersionWhereUniqueInput
  }

  /**
   * SearchModelVersion findFirst
   */
  export type SearchModelVersionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchModelVersion
     */
    select?: SearchModelVersionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchModelVersionInclude<ExtArgs> | null
    /**
     * Filter, which SearchModelVersion to fetch.
     */
    where?: SearchModelVersionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchModelVersions to fetch.
     */
    orderBy?: SearchModelVersionOrderByWithRelationInput | SearchModelVersionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SearchModelVersions.
     */
    cursor?: SearchModelVersionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchModelVersions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchModelVersions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SearchModelVersions.
     */
    distinct?: SearchModelVersionScalarFieldEnum | SearchModelVersionScalarFieldEnum[]
  }

  /**
   * SearchModelVersion findFirstOrThrow
   */
  export type SearchModelVersionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchModelVersion
     */
    select?: SearchModelVersionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchModelVersionInclude<ExtArgs> | null
    /**
     * Filter, which SearchModelVersion to fetch.
     */
    where?: SearchModelVersionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchModelVersions to fetch.
     */
    orderBy?: SearchModelVersionOrderByWithRelationInput | SearchModelVersionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SearchModelVersions.
     */
    cursor?: SearchModelVersionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchModelVersions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchModelVersions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SearchModelVersions.
     */
    distinct?: SearchModelVersionScalarFieldEnum | SearchModelVersionScalarFieldEnum[]
  }

  /**
   * SearchModelVersion findMany
   */
  export type SearchModelVersionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchModelVersion
     */
    select?: SearchModelVersionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchModelVersionInclude<ExtArgs> | null
    /**
     * Filter, which SearchModelVersions to fetch.
     */
    where?: SearchModelVersionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchModelVersions to fetch.
     */
    orderBy?: SearchModelVersionOrderByWithRelationInput | SearchModelVersionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SearchModelVersions.
     */
    cursor?: SearchModelVersionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchModelVersions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchModelVersions.
     */
    skip?: number
    distinct?: SearchModelVersionScalarFieldEnum | SearchModelVersionScalarFieldEnum[]
  }

  /**
   * SearchModelVersion create
   */
  export type SearchModelVersionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchModelVersion
     */
    select?: SearchModelVersionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchModelVersionInclude<ExtArgs> | null
    /**
     * The data needed to create a SearchModelVersion.
     */
    data: XOR<SearchModelVersionCreateInput, SearchModelVersionUncheckedCreateInput>
  }

  /**
   * SearchModelVersion createMany
   */
  export type SearchModelVersionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SearchModelVersions.
     */
    data: SearchModelVersionCreateManyInput | SearchModelVersionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SearchModelVersion createManyAndReturn
   */
  export type SearchModelVersionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchModelVersion
     */
    select?: SearchModelVersionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many SearchModelVersions.
     */
    data: SearchModelVersionCreateManyInput | SearchModelVersionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SearchModelVersion update
   */
  export type SearchModelVersionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchModelVersion
     */
    select?: SearchModelVersionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchModelVersionInclude<ExtArgs> | null
    /**
     * The data needed to update a SearchModelVersion.
     */
    data: XOR<SearchModelVersionUpdateInput, SearchModelVersionUncheckedUpdateInput>
    /**
     * Choose, which SearchModelVersion to update.
     */
    where: SearchModelVersionWhereUniqueInput
  }

  /**
   * SearchModelVersion updateMany
   */
  export type SearchModelVersionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SearchModelVersions.
     */
    data: XOR<SearchModelVersionUpdateManyMutationInput, SearchModelVersionUncheckedUpdateManyInput>
    /**
     * Filter which SearchModelVersions to update
     */
    where?: SearchModelVersionWhereInput
  }

  /**
   * SearchModelVersion upsert
   */
  export type SearchModelVersionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchModelVersion
     */
    select?: SearchModelVersionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchModelVersionInclude<ExtArgs> | null
    /**
     * The filter to search for the SearchModelVersion to update in case it exists.
     */
    where: SearchModelVersionWhereUniqueInput
    /**
     * In case the SearchModelVersion found by the `where` argument doesn't exist, create a new SearchModelVersion with this data.
     */
    create: XOR<SearchModelVersionCreateInput, SearchModelVersionUncheckedCreateInput>
    /**
     * In case the SearchModelVersion was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SearchModelVersionUpdateInput, SearchModelVersionUncheckedUpdateInput>
  }

  /**
   * SearchModelVersion delete
   */
  export type SearchModelVersionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchModelVersion
     */
    select?: SearchModelVersionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchModelVersionInclude<ExtArgs> | null
    /**
     * Filter which SearchModelVersion to delete.
     */
    where: SearchModelVersionWhereUniqueInput
  }

  /**
   * SearchModelVersion deleteMany
   */
  export type SearchModelVersionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SearchModelVersions to delete
     */
    where?: SearchModelVersionWhereInput
  }

  /**
   * SearchModelVersion.embeddings
   */
  export type SearchModelVersion$embeddingsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchEmbedding
     */
    select?: SearchEmbeddingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchEmbeddingInclude<ExtArgs> | null
    where?: SearchEmbeddingWhereInput
    orderBy?: SearchEmbeddingOrderByWithRelationInput | SearchEmbeddingOrderByWithRelationInput[]
    cursor?: SearchEmbeddingWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SearchEmbeddingScalarFieldEnum | SearchEmbeddingScalarFieldEnum[]
  }

  /**
   * SearchModelVersion.indexTasks
   */
  export type SearchModelVersion$indexTasksArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTask
     */
    select?: SearchIndexTaskSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchIndexTaskInclude<ExtArgs> | null
    where?: SearchIndexTaskWhereInput
    orderBy?: SearchIndexTaskOrderByWithRelationInput | SearchIndexTaskOrderByWithRelationInput[]
    cursor?: SearchIndexTaskWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SearchIndexTaskScalarFieldEnum | SearchIndexTaskScalarFieldEnum[]
  }

  /**
   * SearchModelVersion without action
   */
  export type SearchModelVersionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchModelVersion
     */
    select?: SearchModelVersionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchModelVersionInclude<ExtArgs> | null
  }


  /**
   * Model SearchChunk
   */

  export type AggregateSearchChunk = {
    _count: SearchChunkCountAggregateOutputType | null
    _avg: SearchChunkAvgAggregateOutputType | null
    _sum: SearchChunkSumAggregateOutputType | null
    _min: SearchChunkMinAggregateOutputType | null
    _max: SearchChunkMaxAggregateOutputType | null
  }

  export type SearchChunkAvgAggregateOutputType = {
    sourceVersionNo: number | null
    ordinal: number | null
    tokenCount: number | null
  }

  export type SearchChunkSumAggregateOutputType = {
    sourceVersionNo: number | null
    ordinal: number | null
    tokenCount: number | null
  }

  export type SearchChunkMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    researchObjectId: string | null
    artifactId: string | null
    sourceVersionId: string | null
    sourceVersionNo: number | null
    indexTaskId: string | null
    contentHash: string | null
    ordinal: number | null
    language: string | null
    text: string | null
    tokenCount: number | null
    lexicalText: string | null
    active: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SearchChunkMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    researchObjectId: string | null
    artifactId: string | null
    sourceVersionId: string | null
    sourceVersionNo: number | null
    indexTaskId: string | null
    contentHash: string | null
    ordinal: number | null
    language: string | null
    text: string | null
    tokenCount: number | null
    lexicalText: string | null
    active: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SearchChunkCountAggregateOutputType = {
    id: number
    workspaceId: number
    researchObjectId: number
    artifactId: number
    sourceVersionId: number
    sourceVersionNo: number
    indexTaskId: number
    contentHash: number
    ordinal: number
    language: number
    text: number
    tokenCount: number
    locators: number
    claimIds: number
    lexicalTerms: number
    termFrequencies: number
    lexicalText: number
    active: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type SearchChunkAvgAggregateInputType = {
    sourceVersionNo?: true
    ordinal?: true
    tokenCount?: true
  }

  export type SearchChunkSumAggregateInputType = {
    sourceVersionNo?: true
    ordinal?: true
    tokenCount?: true
  }

  export type SearchChunkMinAggregateInputType = {
    id?: true
    workspaceId?: true
    researchObjectId?: true
    artifactId?: true
    sourceVersionId?: true
    sourceVersionNo?: true
    indexTaskId?: true
    contentHash?: true
    ordinal?: true
    language?: true
    text?: true
    tokenCount?: true
    lexicalText?: true
    active?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SearchChunkMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    researchObjectId?: true
    artifactId?: true
    sourceVersionId?: true
    sourceVersionNo?: true
    indexTaskId?: true
    contentHash?: true
    ordinal?: true
    language?: true
    text?: true
    tokenCount?: true
    lexicalText?: true
    active?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SearchChunkCountAggregateInputType = {
    id?: true
    workspaceId?: true
    researchObjectId?: true
    artifactId?: true
    sourceVersionId?: true
    sourceVersionNo?: true
    indexTaskId?: true
    contentHash?: true
    ordinal?: true
    language?: true
    text?: true
    tokenCount?: true
    locators?: true
    claimIds?: true
    lexicalTerms?: true
    termFrequencies?: true
    lexicalText?: true
    active?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type SearchChunkAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SearchChunk to aggregate.
     */
    where?: SearchChunkWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchChunks to fetch.
     */
    orderBy?: SearchChunkOrderByWithRelationInput | SearchChunkOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SearchChunkWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchChunks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchChunks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SearchChunks
    **/
    _count?: true | SearchChunkCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SearchChunkAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SearchChunkSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SearchChunkMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SearchChunkMaxAggregateInputType
  }

  export type GetSearchChunkAggregateType<T extends SearchChunkAggregateArgs> = {
        [P in keyof T & keyof AggregateSearchChunk]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSearchChunk[P]>
      : GetScalarType<T[P], AggregateSearchChunk[P]>
  }




  export type SearchChunkGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SearchChunkWhereInput
    orderBy?: SearchChunkOrderByWithAggregationInput | SearchChunkOrderByWithAggregationInput[]
    by: SearchChunkScalarFieldEnum[] | SearchChunkScalarFieldEnum
    having?: SearchChunkScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SearchChunkCountAggregateInputType | true
    _avg?: SearchChunkAvgAggregateInputType
    _sum?: SearchChunkSumAggregateInputType
    _min?: SearchChunkMinAggregateInputType
    _max?: SearchChunkMaxAggregateInputType
  }

  export type SearchChunkGroupByOutputType = {
    id: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId: string | null
    sourceVersionNo: number | null
    indexTaskId: string | null
    contentHash: string
    ordinal: number
    language: string
    text: string
    tokenCount: number
    locators: JsonValue
    claimIds: JsonValue
    lexicalTerms: JsonValue
    termFrequencies: JsonValue
    lexicalText: string
    active: boolean
    createdAt: Date
    updatedAt: Date
    _count: SearchChunkCountAggregateOutputType | null
    _avg: SearchChunkAvgAggregateOutputType | null
    _sum: SearchChunkSumAggregateOutputType | null
    _min: SearchChunkMinAggregateOutputType | null
    _max: SearchChunkMaxAggregateOutputType | null
  }

  type GetSearchChunkGroupByPayload<T extends SearchChunkGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SearchChunkGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SearchChunkGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SearchChunkGroupByOutputType[P]>
            : GetScalarType<T[P], SearchChunkGroupByOutputType[P]>
        }
      >
    >


  export type SearchChunkSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    researchObjectId?: boolean
    artifactId?: boolean
    sourceVersionId?: boolean
    sourceVersionNo?: boolean
    indexTaskId?: boolean
    contentHash?: boolean
    ordinal?: boolean
    language?: boolean
    text?: boolean
    tokenCount?: boolean
    locators?: boolean
    claimIds?: boolean
    lexicalTerms?: boolean
    termFrequencies?: boolean
    lexicalText?: boolean
    active?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    embeddings?: boolean | SearchChunk$embeddingsArgs<ExtArgs>
    indexTask?: boolean | SearchChunk$indexTaskArgs<ExtArgs>
    _count?: boolean | SearchChunkCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["searchChunk"]>

  export type SearchChunkSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    researchObjectId?: boolean
    artifactId?: boolean
    sourceVersionId?: boolean
    sourceVersionNo?: boolean
    indexTaskId?: boolean
    contentHash?: boolean
    ordinal?: boolean
    language?: boolean
    text?: boolean
    tokenCount?: boolean
    locators?: boolean
    claimIds?: boolean
    lexicalTerms?: boolean
    termFrequencies?: boolean
    lexicalText?: boolean
    active?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    indexTask?: boolean | SearchChunk$indexTaskArgs<ExtArgs>
  }, ExtArgs["result"]["searchChunk"]>

  export type SearchChunkSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    researchObjectId?: boolean
    artifactId?: boolean
    sourceVersionId?: boolean
    sourceVersionNo?: boolean
    indexTaskId?: boolean
    contentHash?: boolean
    ordinal?: boolean
    language?: boolean
    text?: boolean
    tokenCount?: boolean
    locators?: boolean
    claimIds?: boolean
    lexicalTerms?: boolean
    termFrequencies?: boolean
    lexicalText?: boolean
    active?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type SearchChunkInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    embeddings?: boolean | SearchChunk$embeddingsArgs<ExtArgs>
    indexTask?: boolean | SearchChunk$indexTaskArgs<ExtArgs>
    _count?: boolean | SearchChunkCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type SearchChunkIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    indexTask?: boolean | SearchChunk$indexTaskArgs<ExtArgs>
  }

  export type $SearchChunkPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SearchChunk"
    objects: {
      embeddings: Prisma.$SearchEmbeddingPayload<ExtArgs>[]
      indexTask: Prisma.$SearchIndexTaskPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string
      researchObjectId: string
      artifactId: string
      sourceVersionId: string | null
      sourceVersionNo: number | null
      indexTaskId: string | null
      contentHash: string
      ordinal: number
      language: string
      text: string
      tokenCount: number
      locators: Prisma.JsonValue
      claimIds: Prisma.JsonValue
      lexicalTerms: Prisma.JsonValue
      termFrequencies: Prisma.JsonValue
      lexicalText: string
      active: boolean
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["searchChunk"]>
    composites: {}
  }

  type SearchChunkGetPayload<S extends boolean | null | undefined | SearchChunkDefaultArgs> = $Result.GetResult<Prisma.$SearchChunkPayload, S>

  type SearchChunkCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<SearchChunkFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: SearchChunkCountAggregateInputType | true
    }

  export interface SearchChunkDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SearchChunk'], meta: { name: 'SearchChunk' } }
    /**
     * Find zero or one SearchChunk that matches the filter.
     * @param {SearchChunkFindUniqueArgs} args - Arguments to find a SearchChunk
     * @example
     * // Get one SearchChunk
     * const searchChunk = await prisma.searchChunk.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SearchChunkFindUniqueArgs>(args: SelectSubset<T, SearchChunkFindUniqueArgs<ExtArgs>>): Prisma__SearchChunkClient<$Result.GetResult<Prisma.$SearchChunkPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one SearchChunk that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {SearchChunkFindUniqueOrThrowArgs} args - Arguments to find a SearchChunk
     * @example
     * // Get one SearchChunk
     * const searchChunk = await prisma.searchChunk.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SearchChunkFindUniqueOrThrowArgs>(args: SelectSubset<T, SearchChunkFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SearchChunkClient<$Result.GetResult<Prisma.$SearchChunkPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first SearchChunk that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchChunkFindFirstArgs} args - Arguments to find a SearchChunk
     * @example
     * // Get one SearchChunk
     * const searchChunk = await prisma.searchChunk.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SearchChunkFindFirstArgs>(args?: SelectSubset<T, SearchChunkFindFirstArgs<ExtArgs>>): Prisma__SearchChunkClient<$Result.GetResult<Prisma.$SearchChunkPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first SearchChunk that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchChunkFindFirstOrThrowArgs} args - Arguments to find a SearchChunk
     * @example
     * // Get one SearchChunk
     * const searchChunk = await prisma.searchChunk.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SearchChunkFindFirstOrThrowArgs>(args?: SelectSubset<T, SearchChunkFindFirstOrThrowArgs<ExtArgs>>): Prisma__SearchChunkClient<$Result.GetResult<Prisma.$SearchChunkPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more SearchChunks that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchChunkFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SearchChunks
     * const searchChunks = await prisma.searchChunk.findMany()
     * 
     * // Get first 10 SearchChunks
     * const searchChunks = await prisma.searchChunk.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const searchChunkWithIdOnly = await prisma.searchChunk.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SearchChunkFindManyArgs>(args?: SelectSubset<T, SearchChunkFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchChunkPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a SearchChunk.
     * @param {SearchChunkCreateArgs} args - Arguments to create a SearchChunk.
     * @example
     * // Create one SearchChunk
     * const SearchChunk = await prisma.searchChunk.create({
     *   data: {
     *     // ... data to create a SearchChunk
     *   }
     * })
     * 
     */
    create<T extends SearchChunkCreateArgs>(args: SelectSubset<T, SearchChunkCreateArgs<ExtArgs>>): Prisma__SearchChunkClient<$Result.GetResult<Prisma.$SearchChunkPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many SearchChunks.
     * @param {SearchChunkCreateManyArgs} args - Arguments to create many SearchChunks.
     * @example
     * // Create many SearchChunks
     * const searchChunk = await prisma.searchChunk.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SearchChunkCreateManyArgs>(args?: SelectSubset<T, SearchChunkCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SearchChunks and returns the data saved in the database.
     * @param {SearchChunkCreateManyAndReturnArgs} args - Arguments to create many SearchChunks.
     * @example
     * // Create many SearchChunks
     * const searchChunk = await prisma.searchChunk.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SearchChunks and only return the `id`
     * const searchChunkWithIdOnly = await prisma.searchChunk.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SearchChunkCreateManyAndReturnArgs>(args?: SelectSubset<T, SearchChunkCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchChunkPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a SearchChunk.
     * @param {SearchChunkDeleteArgs} args - Arguments to delete one SearchChunk.
     * @example
     * // Delete one SearchChunk
     * const SearchChunk = await prisma.searchChunk.delete({
     *   where: {
     *     // ... filter to delete one SearchChunk
     *   }
     * })
     * 
     */
    delete<T extends SearchChunkDeleteArgs>(args: SelectSubset<T, SearchChunkDeleteArgs<ExtArgs>>): Prisma__SearchChunkClient<$Result.GetResult<Prisma.$SearchChunkPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one SearchChunk.
     * @param {SearchChunkUpdateArgs} args - Arguments to update one SearchChunk.
     * @example
     * // Update one SearchChunk
     * const searchChunk = await prisma.searchChunk.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SearchChunkUpdateArgs>(args: SelectSubset<T, SearchChunkUpdateArgs<ExtArgs>>): Prisma__SearchChunkClient<$Result.GetResult<Prisma.$SearchChunkPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more SearchChunks.
     * @param {SearchChunkDeleteManyArgs} args - Arguments to filter SearchChunks to delete.
     * @example
     * // Delete a few SearchChunks
     * const { count } = await prisma.searchChunk.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SearchChunkDeleteManyArgs>(args?: SelectSubset<T, SearchChunkDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SearchChunks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchChunkUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SearchChunks
     * const searchChunk = await prisma.searchChunk.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SearchChunkUpdateManyArgs>(args: SelectSubset<T, SearchChunkUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one SearchChunk.
     * @param {SearchChunkUpsertArgs} args - Arguments to update or create a SearchChunk.
     * @example
     * // Update or create a SearchChunk
     * const searchChunk = await prisma.searchChunk.upsert({
     *   create: {
     *     // ... data to create a SearchChunk
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SearchChunk we want to update
     *   }
     * })
     */
    upsert<T extends SearchChunkUpsertArgs>(args: SelectSubset<T, SearchChunkUpsertArgs<ExtArgs>>): Prisma__SearchChunkClient<$Result.GetResult<Prisma.$SearchChunkPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of SearchChunks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchChunkCountArgs} args - Arguments to filter SearchChunks to count.
     * @example
     * // Count the number of SearchChunks
     * const count = await prisma.searchChunk.count({
     *   where: {
     *     // ... the filter for the SearchChunks we want to count
     *   }
     * })
    **/
    count<T extends SearchChunkCountArgs>(
      args?: Subset<T, SearchChunkCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SearchChunkCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SearchChunk.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchChunkAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SearchChunkAggregateArgs>(args: Subset<T, SearchChunkAggregateArgs>): Prisma.PrismaPromise<GetSearchChunkAggregateType<T>>

    /**
     * Group by SearchChunk.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchChunkGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SearchChunkGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SearchChunkGroupByArgs['orderBy'] }
        : { orderBy?: SearchChunkGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SearchChunkGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSearchChunkGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SearchChunk model
   */
  readonly fields: SearchChunkFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SearchChunk.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SearchChunkClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    embeddings<T extends SearchChunk$embeddingsArgs<ExtArgs> = {}>(args?: Subset<T, SearchChunk$embeddingsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchEmbeddingPayload<ExtArgs>, T, "findMany"> | Null>
    indexTask<T extends SearchChunk$indexTaskArgs<ExtArgs> = {}>(args?: Subset<T, SearchChunk$indexTaskArgs<ExtArgs>>): Prisma__SearchIndexTaskClient<$Result.GetResult<Prisma.$SearchIndexTaskPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SearchChunk model
   */ 
  interface SearchChunkFieldRefs {
    readonly id: FieldRef<"SearchChunk", 'String'>
    readonly workspaceId: FieldRef<"SearchChunk", 'String'>
    readonly researchObjectId: FieldRef<"SearchChunk", 'String'>
    readonly artifactId: FieldRef<"SearchChunk", 'String'>
    readonly sourceVersionId: FieldRef<"SearchChunk", 'String'>
    readonly sourceVersionNo: FieldRef<"SearchChunk", 'Int'>
    readonly indexTaskId: FieldRef<"SearchChunk", 'String'>
    readonly contentHash: FieldRef<"SearchChunk", 'String'>
    readonly ordinal: FieldRef<"SearchChunk", 'Int'>
    readonly language: FieldRef<"SearchChunk", 'String'>
    readonly text: FieldRef<"SearchChunk", 'String'>
    readonly tokenCount: FieldRef<"SearchChunk", 'Int'>
    readonly locators: FieldRef<"SearchChunk", 'Json'>
    readonly claimIds: FieldRef<"SearchChunk", 'Json'>
    readonly lexicalTerms: FieldRef<"SearchChunk", 'Json'>
    readonly termFrequencies: FieldRef<"SearchChunk", 'Json'>
    readonly lexicalText: FieldRef<"SearchChunk", 'String'>
    readonly active: FieldRef<"SearchChunk", 'Boolean'>
    readonly createdAt: FieldRef<"SearchChunk", 'DateTime'>
    readonly updatedAt: FieldRef<"SearchChunk", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SearchChunk findUnique
   */
  export type SearchChunkFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchChunk
     */
    select?: SearchChunkSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchChunkInclude<ExtArgs> | null
    /**
     * Filter, which SearchChunk to fetch.
     */
    where: SearchChunkWhereUniqueInput
  }

  /**
   * SearchChunk findUniqueOrThrow
   */
  export type SearchChunkFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchChunk
     */
    select?: SearchChunkSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchChunkInclude<ExtArgs> | null
    /**
     * Filter, which SearchChunk to fetch.
     */
    where: SearchChunkWhereUniqueInput
  }

  /**
   * SearchChunk findFirst
   */
  export type SearchChunkFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchChunk
     */
    select?: SearchChunkSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchChunkInclude<ExtArgs> | null
    /**
     * Filter, which SearchChunk to fetch.
     */
    where?: SearchChunkWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchChunks to fetch.
     */
    orderBy?: SearchChunkOrderByWithRelationInput | SearchChunkOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SearchChunks.
     */
    cursor?: SearchChunkWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchChunks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchChunks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SearchChunks.
     */
    distinct?: SearchChunkScalarFieldEnum | SearchChunkScalarFieldEnum[]
  }

  /**
   * SearchChunk findFirstOrThrow
   */
  export type SearchChunkFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchChunk
     */
    select?: SearchChunkSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchChunkInclude<ExtArgs> | null
    /**
     * Filter, which SearchChunk to fetch.
     */
    where?: SearchChunkWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchChunks to fetch.
     */
    orderBy?: SearchChunkOrderByWithRelationInput | SearchChunkOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SearchChunks.
     */
    cursor?: SearchChunkWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchChunks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchChunks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SearchChunks.
     */
    distinct?: SearchChunkScalarFieldEnum | SearchChunkScalarFieldEnum[]
  }

  /**
   * SearchChunk findMany
   */
  export type SearchChunkFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchChunk
     */
    select?: SearchChunkSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchChunkInclude<ExtArgs> | null
    /**
     * Filter, which SearchChunks to fetch.
     */
    where?: SearchChunkWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchChunks to fetch.
     */
    orderBy?: SearchChunkOrderByWithRelationInput | SearchChunkOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SearchChunks.
     */
    cursor?: SearchChunkWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchChunks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchChunks.
     */
    skip?: number
    distinct?: SearchChunkScalarFieldEnum | SearchChunkScalarFieldEnum[]
  }

  /**
   * SearchChunk create
   */
  export type SearchChunkCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchChunk
     */
    select?: SearchChunkSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchChunkInclude<ExtArgs> | null
    /**
     * The data needed to create a SearchChunk.
     */
    data: XOR<SearchChunkCreateInput, SearchChunkUncheckedCreateInput>
  }

  /**
   * SearchChunk createMany
   */
  export type SearchChunkCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SearchChunks.
     */
    data: SearchChunkCreateManyInput | SearchChunkCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SearchChunk createManyAndReturn
   */
  export type SearchChunkCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchChunk
     */
    select?: SearchChunkSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many SearchChunks.
     */
    data: SearchChunkCreateManyInput | SearchChunkCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchChunkIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SearchChunk update
   */
  export type SearchChunkUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchChunk
     */
    select?: SearchChunkSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchChunkInclude<ExtArgs> | null
    /**
     * The data needed to update a SearchChunk.
     */
    data: XOR<SearchChunkUpdateInput, SearchChunkUncheckedUpdateInput>
    /**
     * Choose, which SearchChunk to update.
     */
    where: SearchChunkWhereUniqueInput
  }

  /**
   * SearchChunk updateMany
   */
  export type SearchChunkUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SearchChunks.
     */
    data: XOR<SearchChunkUpdateManyMutationInput, SearchChunkUncheckedUpdateManyInput>
    /**
     * Filter which SearchChunks to update
     */
    where?: SearchChunkWhereInput
  }

  /**
   * SearchChunk upsert
   */
  export type SearchChunkUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchChunk
     */
    select?: SearchChunkSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchChunkInclude<ExtArgs> | null
    /**
     * The filter to search for the SearchChunk to update in case it exists.
     */
    where: SearchChunkWhereUniqueInput
    /**
     * In case the SearchChunk found by the `where` argument doesn't exist, create a new SearchChunk with this data.
     */
    create: XOR<SearchChunkCreateInput, SearchChunkUncheckedCreateInput>
    /**
     * In case the SearchChunk was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SearchChunkUpdateInput, SearchChunkUncheckedUpdateInput>
  }

  /**
   * SearchChunk delete
   */
  export type SearchChunkDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchChunk
     */
    select?: SearchChunkSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchChunkInclude<ExtArgs> | null
    /**
     * Filter which SearchChunk to delete.
     */
    where: SearchChunkWhereUniqueInput
  }

  /**
   * SearchChunk deleteMany
   */
  export type SearchChunkDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SearchChunks to delete
     */
    where?: SearchChunkWhereInput
  }

  /**
   * SearchChunk.embeddings
   */
  export type SearchChunk$embeddingsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchEmbedding
     */
    select?: SearchEmbeddingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchEmbeddingInclude<ExtArgs> | null
    where?: SearchEmbeddingWhereInput
    orderBy?: SearchEmbeddingOrderByWithRelationInput | SearchEmbeddingOrderByWithRelationInput[]
    cursor?: SearchEmbeddingWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SearchEmbeddingScalarFieldEnum | SearchEmbeddingScalarFieldEnum[]
  }

  /**
   * SearchChunk.indexTask
   */
  export type SearchChunk$indexTaskArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTask
     */
    select?: SearchIndexTaskSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchIndexTaskInclude<ExtArgs> | null
    where?: SearchIndexTaskWhereInput
  }

  /**
   * SearchChunk without action
   */
  export type SearchChunkDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchChunk
     */
    select?: SearchChunkSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchChunkInclude<ExtArgs> | null
  }


  /**
   * Model SearchEmbedding
   */

  export type AggregateSearchEmbedding = {
    _count: SearchEmbeddingCountAggregateOutputType | null
    _avg: SearchEmbeddingAvgAggregateOutputType | null
    _sum: SearchEmbeddingSumAggregateOutputType | null
    _min: SearchEmbeddingMinAggregateOutputType | null
    _max: SearchEmbeddingMaxAggregateOutputType | null
  }

  export type SearchEmbeddingAvgAggregateOutputType = {
    dimension: number | null
    norm: number | null
  }

  export type SearchEmbeddingSumAggregateOutputType = {
    dimension: number | null
    norm: number | null
  }

  export type SearchEmbeddingMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    chunkId: string | null
    modelVersionId: string | null
    dimension: number | null
    vector: Buffer | null
    vectorSha256: string | null
    norm: number | null
    createdAt: Date | null
  }

  export type SearchEmbeddingMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    chunkId: string | null
    modelVersionId: string | null
    dimension: number | null
    vector: Buffer | null
    vectorSha256: string | null
    norm: number | null
    createdAt: Date | null
  }

  export type SearchEmbeddingCountAggregateOutputType = {
    id: number
    workspaceId: number
    chunkId: number
    modelVersionId: number
    dimension: number
    vector: number
    vectorSha256: number
    norm: number
    createdAt: number
    _all: number
  }


  export type SearchEmbeddingAvgAggregateInputType = {
    dimension?: true
    norm?: true
  }

  export type SearchEmbeddingSumAggregateInputType = {
    dimension?: true
    norm?: true
  }

  export type SearchEmbeddingMinAggregateInputType = {
    id?: true
    workspaceId?: true
    chunkId?: true
    modelVersionId?: true
    dimension?: true
    vector?: true
    vectorSha256?: true
    norm?: true
    createdAt?: true
  }

  export type SearchEmbeddingMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    chunkId?: true
    modelVersionId?: true
    dimension?: true
    vector?: true
    vectorSha256?: true
    norm?: true
    createdAt?: true
  }

  export type SearchEmbeddingCountAggregateInputType = {
    id?: true
    workspaceId?: true
    chunkId?: true
    modelVersionId?: true
    dimension?: true
    vector?: true
    vectorSha256?: true
    norm?: true
    createdAt?: true
    _all?: true
  }

  export type SearchEmbeddingAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SearchEmbedding to aggregate.
     */
    where?: SearchEmbeddingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchEmbeddings to fetch.
     */
    orderBy?: SearchEmbeddingOrderByWithRelationInput | SearchEmbeddingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SearchEmbeddingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchEmbeddings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchEmbeddings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SearchEmbeddings
    **/
    _count?: true | SearchEmbeddingCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SearchEmbeddingAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SearchEmbeddingSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SearchEmbeddingMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SearchEmbeddingMaxAggregateInputType
  }

  export type GetSearchEmbeddingAggregateType<T extends SearchEmbeddingAggregateArgs> = {
        [P in keyof T & keyof AggregateSearchEmbedding]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSearchEmbedding[P]>
      : GetScalarType<T[P], AggregateSearchEmbedding[P]>
  }




  export type SearchEmbeddingGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SearchEmbeddingWhereInput
    orderBy?: SearchEmbeddingOrderByWithAggregationInput | SearchEmbeddingOrderByWithAggregationInput[]
    by: SearchEmbeddingScalarFieldEnum[] | SearchEmbeddingScalarFieldEnum
    having?: SearchEmbeddingScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SearchEmbeddingCountAggregateInputType | true
    _avg?: SearchEmbeddingAvgAggregateInputType
    _sum?: SearchEmbeddingSumAggregateInputType
    _min?: SearchEmbeddingMinAggregateInputType
    _max?: SearchEmbeddingMaxAggregateInputType
  }

  export type SearchEmbeddingGroupByOutputType = {
    id: string
    workspaceId: string
    chunkId: string
    modelVersionId: string
    dimension: number
    vector: Buffer
    vectorSha256: string
    norm: number
    createdAt: Date
    _count: SearchEmbeddingCountAggregateOutputType | null
    _avg: SearchEmbeddingAvgAggregateOutputType | null
    _sum: SearchEmbeddingSumAggregateOutputType | null
    _min: SearchEmbeddingMinAggregateOutputType | null
    _max: SearchEmbeddingMaxAggregateOutputType | null
  }

  type GetSearchEmbeddingGroupByPayload<T extends SearchEmbeddingGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SearchEmbeddingGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SearchEmbeddingGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SearchEmbeddingGroupByOutputType[P]>
            : GetScalarType<T[P], SearchEmbeddingGroupByOutputType[P]>
        }
      >
    >


  export type SearchEmbeddingSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    chunkId?: boolean
    modelVersionId?: boolean
    dimension?: boolean
    vector?: boolean
    vectorSha256?: boolean
    norm?: boolean
    createdAt?: boolean
    chunk?: boolean | SearchChunkDefaultArgs<ExtArgs>
    modelVersion?: boolean | SearchModelVersionDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["searchEmbedding"]>

  export type SearchEmbeddingSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    chunkId?: boolean
    modelVersionId?: boolean
    dimension?: boolean
    vector?: boolean
    vectorSha256?: boolean
    norm?: boolean
    createdAt?: boolean
    chunk?: boolean | SearchChunkDefaultArgs<ExtArgs>
    modelVersion?: boolean | SearchModelVersionDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["searchEmbedding"]>

  export type SearchEmbeddingSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    chunkId?: boolean
    modelVersionId?: boolean
    dimension?: boolean
    vector?: boolean
    vectorSha256?: boolean
    norm?: boolean
    createdAt?: boolean
  }

  export type SearchEmbeddingInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    chunk?: boolean | SearchChunkDefaultArgs<ExtArgs>
    modelVersion?: boolean | SearchModelVersionDefaultArgs<ExtArgs>
  }
  export type SearchEmbeddingIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    chunk?: boolean | SearchChunkDefaultArgs<ExtArgs>
    modelVersion?: boolean | SearchModelVersionDefaultArgs<ExtArgs>
  }

  export type $SearchEmbeddingPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SearchEmbedding"
    objects: {
      chunk: Prisma.$SearchChunkPayload<ExtArgs>
      modelVersion: Prisma.$SearchModelVersionPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string
      chunkId: string
      modelVersionId: string
      dimension: number
      vector: Buffer
      vectorSha256: string
      norm: number
      createdAt: Date
    }, ExtArgs["result"]["searchEmbedding"]>
    composites: {}
  }

  type SearchEmbeddingGetPayload<S extends boolean | null | undefined | SearchEmbeddingDefaultArgs> = $Result.GetResult<Prisma.$SearchEmbeddingPayload, S>

  type SearchEmbeddingCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<SearchEmbeddingFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: SearchEmbeddingCountAggregateInputType | true
    }

  export interface SearchEmbeddingDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SearchEmbedding'], meta: { name: 'SearchEmbedding' } }
    /**
     * Find zero or one SearchEmbedding that matches the filter.
     * @param {SearchEmbeddingFindUniqueArgs} args - Arguments to find a SearchEmbedding
     * @example
     * // Get one SearchEmbedding
     * const searchEmbedding = await prisma.searchEmbedding.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SearchEmbeddingFindUniqueArgs>(args: SelectSubset<T, SearchEmbeddingFindUniqueArgs<ExtArgs>>): Prisma__SearchEmbeddingClient<$Result.GetResult<Prisma.$SearchEmbeddingPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one SearchEmbedding that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {SearchEmbeddingFindUniqueOrThrowArgs} args - Arguments to find a SearchEmbedding
     * @example
     * // Get one SearchEmbedding
     * const searchEmbedding = await prisma.searchEmbedding.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SearchEmbeddingFindUniqueOrThrowArgs>(args: SelectSubset<T, SearchEmbeddingFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SearchEmbeddingClient<$Result.GetResult<Prisma.$SearchEmbeddingPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first SearchEmbedding that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchEmbeddingFindFirstArgs} args - Arguments to find a SearchEmbedding
     * @example
     * // Get one SearchEmbedding
     * const searchEmbedding = await prisma.searchEmbedding.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SearchEmbeddingFindFirstArgs>(args?: SelectSubset<T, SearchEmbeddingFindFirstArgs<ExtArgs>>): Prisma__SearchEmbeddingClient<$Result.GetResult<Prisma.$SearchEmbeddingPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first SearchEmbedding that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchEmbeddingFindFirstOrThrowArgs} args - Arguments to find a SearchEmbedding
     * @example
     * // Get one SearchEmbedding
     * const searchEmbedding = await prisma.searchEmbedding.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SearchEmbeddingFindFirstOrThrowArgs>(args?: SelectSubset<T, SearchEmbeddingFindFirstOrThrowArgs<ExtArgs>>): Prisma__SearchEmbeddingClient<$Result.GetResult<Prisma.$SearchEmbeddingPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more SearchEmbeddings that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchEmbeddingFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SearchEmbeddings
     * const searchEmbeddings = await prisma.searchEmbedding.findMany()
     * 
     * // Get first 10 SearchEmbeddings
     * const searchEmbeddings = await prisma.searchEmbedding.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const searchEmbeddingWithIdOnly = await prisma.searchEmbedding.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SearchEmbeddingFindManyArgs>(args?: SelectSubset<T, SearchEmbeddingFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchEmbeddingPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a SearchEmbedding.
     * @param {SearchEmbeddingCreateArgs} args - Arguments to create a SearchEmbedding.
     * @example
     * // Create one SearchEmbedding
     * const SearchEmbedding = await prisma.searchEmbedding.create({
     *   data: {
     *     // ... data to create a SearchEmbedding
     *   }
     * })
     * 
     */
    create<T extends SearchEmbeddingCreateArgs>(args: SelectSubset<T, SearchEmbeddingCreateArgs<ExtArgs>>): Prisma__SearchEmbeddingClient<$Result.GetResult<Prisma.$SearchEmbeddingPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many SearchEmbeddings.
     * @param {SearchEmbeddingCreateManyArgs} args - Arguments to create many SearchEmbeddings.
     * @example
     * // Create many SearchEmbeddings
     * const searchEmbedding = await prisma.searchEmbedding.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SearchEmbeddingCreateManyArgs>(args?: SelectSubset<T, SearchEmbeddingCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SearchEmbeddings and returns the data saved in the database.
     * @param {SearchEmbeddingCreateManyAndReturnArgs} args - Arguments to create many SearchEmbeddings.
     * @example
     * // Create many SearchEmbeddings
     * const searchEmbedding = await prisma.searchEmbedding.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SearchEmbeddings and only return the `id`
     * const searchEmbeddingWithIdOnly = await prisma.searchEmbedding.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SearchEmbeddingCreateManyAndReturnArgs>(args?: SelectSubset<T, SearchEmbeddingCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchEmbeddingPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a SearchEmbedding.
     * @param {SearchEmbeddingDeleteArgs} args - Arguments to delete one SearchEmbedding.
     * @example
     * // Delete one SearchEmbedding
     * const SearchEmbedding = await prisma.searchEmbedding.delete({
     *   where: {
     *     // ... filter to delete one SearchEmbedding
     *   }
     * })
     * 
     */
    delete<T extends SearchEmbeddingDeleteArgs>(args: SelectSubset<T, SearchEmbeddingDeleteArgs<ExtArgs>>): Prisma__SearchEmbeddingClient<$Result.GetResult<Prisma.$SearchEmbeddingPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one SearchEmbedding.
     * @param {SearchEmbeddingUpdateArgs} args - Arguments to update one SearchEmbedding.
     * @example
     * // Update one SearchEmbedding
     * const searchEmbedding = await prisma.searchEmbedding.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SearchEmbeddingUpdateArgs>(args: SelectSubset<T, SearchEmbeddingUpdateArgs<ExtArgs>>): Prisma__SearchEmbeddingClient<$Result.GetResult<Prisma.$SearchEmbeddingPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more SearchEmbeddings.
     * @param {SearchEmbeddingDeleteManyArgs} args - Arguments to filter SearchEmbeddings to delete.
     * @example
     * // Delete a few SearchEmbeddings
     * const { count } = await prisma.searchEmbedding.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SearchEmbeddingDeleteManyArgs>(args?: SelectSubset<T, SearchEmbeddingDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SearchEmbeddings.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchEmbeddingUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SearchEmbeddings
     * const searchEmbedding = await prisma.searchEmbedding.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SearchEmbeddingUpdateManyArgs>(args: SelectSubset<T, SearchEmbeddingUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one SearchEmbedding.
     * @param {SearchEmbeddingUpsertArgs} args - Arguments to update or create a SearchEmbedding.
     * @example
     * // Update or create a SearchEmbedding
     * const searchEmbedding = await prisma.searchEmbedding.upsert({
     *   create: {
     *     // ... data to create a SearchEmbedding
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SearchEmbedding we want to update
     *   }
     * })
     */
    upsert<T extends SearchEmbeddingUpsertArgs>(args: SelectSubset<T, SearchEmbeddingUpsertArgs<ExtArgs>>): Prisma__SearchEmbeddingClient<$Result.GetResult<Prisma.$SearchEmbeddingPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of SearchEmbeddings.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchEmbeddingCountArgs} args - Arguments to filter SearchEmbeddings to count.
     * @example
     * // Count the number of SearchEmbeddings
     * const count = await prisma.searchEmbedding.count({
     *   where: {
     *     // ... the filter for the SearchEmbeddings we want to count
     *   }
     * })
    **/
    count<T extends SearchEmbeddingCountArgs>(
      args?: Subset<T, SearchEmbeddingCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SearchEmbeddingCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SearchEmbedding.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchEmbeddingAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SearchEmbeddingAggregateArgs>(args: Subset<T, SearchEmbeddingAggregateArgs>): Prisma.PrismaPromise<GetSearchEmbeddingAggregateType<T>>

    /**
     * Group by SearchEmbedding.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchEmbeddingGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SearchEmbeddingGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SearchEmbeddingGroupByArgs['orderBy'] }
        : { orderBy?: SearchEmbeddingGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SearchEmbeddingGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSearchEmbeddingGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SearchEmbedding model
   */
  readonly fields: SearchEmbeddingFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SearchEmbedding.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SearchEmbeddingClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    chunk<T extends SearchChunkDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SearchChunkDefaultArgs<ExtArgs>>): Prisma__SearchChunkClient<$Result.GetResult<Prisma.$SearchChunkPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    modelVersion<T extends SearchModelVersionDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SearchModelVersionDefaultArgs<ExtArgs>>): Prisma__SearchModelVersionClient<$Result.GetResult<Prisma.$SearchModelVersionPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SearchEmbedding model
   */ 
  interface SearchEmbeddingFieldRefs {
    readonly id: FieldRef<"SearchEmbedding", 'String'>
    readonly workspaceId: FieldRef<"SearchEmbedding", 'String'>
    readonly chunkId: FieldRef<"SearchEmbedding", 'String'>
    readonly modelVersionId: FieldRef<"SearchEmbedding", 'String'>
    readonly dimension: FieldRef<"SearchEmbedding", 'Int'>
    readonly vector: FieldRef<"SearchEmbedding", 'Bytes'>
    readonly vectorSha256: FieldRef<"SearchEmbedding", 'String'>
    readonly norm: FieldRef<"SearchEmbedding", 'Float'>
    readonly createdAt: FieldRef<"SearchEmbedding", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SearchEmbedding findUnique
   */
  export type SearchEmbeddingFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchEmbedding
     */
    select?: SearchEmbeddingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchEmbeddingInclude<ExtArgs> | null
    /**
     * Filter, which SearchEmbedding to fetch.
     */
    where: SearchEmbeddingWhereUniqueInput
  }

  /**
   * SearchEmbedding findUniqueOrThrow
   */
  export type SearchEmbeddingFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchEmbedding
     */
    select?: SearchEmbeddingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchEmbeddingInclude<ExtArgs> | null
    /**
     * Filter, which SearchEmbedding to fetch.
     */
    where: SearchEmbeddingWhereUniqueInput
  }

  /**
   * SearchEmbedding findFirst
   */
  export type SearchEmbeddingFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchEmbedding
     */
    select?: SearchEmbeddingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchEmbeddingInclude<ExtArgs> | null
    /**
     * Filter, which SearchEmbedding to fetch.
     */
    where?: SearchEmbeddingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchEmbeddings to fetch.
     */
    orderBy?: SearchEmbeddingOrderByWithRelationInput | SearchEmbeddingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SearchEmbeddings.
     */
    cursor?: SearchEmbeddingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchEmbeddings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchEmbeddings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SearchEmbeddings.
     */
    distinct?: SearchEmbeddingScalarFieldEnum | SearchEmbeddingScalarFieldEnum[]
  }

  /**
   * SearchEmbedding findFirstOrThrow
   */
  export type SearchEmbeddingFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchEmbedding
     */
    select?: SearchEmbeddingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchEmbeddingInclude<ExtArgs> | null
    /**
     * Filter, which SearchEmbedding to fetch.
     */
    where?: SearchEmbeddingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchEmbeddings to fetch.
     */
    orderBy?: SearchEmbeddingOrderByWithRelationInput | SearchEmbeddingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SearchEmbeddings.
     */
    cursor?: SearchEmbeddingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchEmbeddings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchEmbeddings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SearchEmbeddings.
     */
    distinct?: SearchEmbeddingScalarFieldEnum | SearchEmbeddingScalarFieldEnum[]
  }

  /**
   * SearchEmbedding findMany
   */
  export type SearchEmbeddingFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchEmbedding
     */
    select?: SearchEmbeddingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchEmbeddingInclude<ExtArgs> | null
    /**
     * Filter, which SearchEmbeddings to fetch.
     */
    where?: SearchEmbeddingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchEmbeddings to fetch.
     */
    orderBy?: SearchEmbeddingOrderByWithRelationInput | SearchEmbeddingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SearchEmbeddings.
     */
    cursor?: SearchEmbeddingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchEmbeddings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchEmbeddings.
     */
    skip?: number
    distinct?: SearchEmbeddingScalarFieldEnum | SearchEmbeddingScalarFieldEnum[]
  }

  /**
   * SearchEmbedding create
   */
  export type SearchEmbeddingCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchEmbedding
     */
    select?: SearchEmbeddingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchEmbeddingInclude<ExtArgs> | null
    /**
     * The data needed to create a SearchEmbedding.
     */
    data: XOR<SearchEmbeddingCreateInput, SearchEmbeddingUncheckedCreateInput>
  }

  /**
   * SearchEmbedding createMany
   */
  export type SearchEmbeddingCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SearchEmbeddings.
     */
    data: SearchEmbeddingCreateManyInput | SearchEmbeddingCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SearchEmbedding createManyAndReturn
   */
  export type SearchEmbeddingCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchEmbedding
     */
    select?: SearchEmbeddingSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many SearchEmbeddings.
     */
    data: SearchEmbeddingCreateManyInput | SearchEmbeddingCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchEmbeddingIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SearchEmbedding update
   */
  export type SearchEmbeddingUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchEmbedding
     */
    select?: SearchEmbeddingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchEmbeddingInclude<ExtArgs> | null
    /**
     * The data needed to update a SearchEmbedding.
     */
    data: XOR<SearchEmbeddingUpdateInput, SearchEmbeddingUncheckedUpdateInput>
    /**
     * Choose, which SearchEmbedding to update.
     */
    where: SearchEmbeddingWhereUniqueInput
  }

  /**
   * SearchEmbedding updateMany
   */
  export type SearchEmbeddingUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SearchEmbeddings.
     */
    data: XOR<SearchEmbeddingUpdateManyMutationInput, SearchEmbeddingUncheckedUpdateManyInput>
    /**
     * Filter which SearchEmbeddings to update
     */
    where?: SearchEmbeddingWhereInput
  }

  /**
   * SearchEmbedding upsert
   */
  export type SearchEmbeddingUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchEmbedding
     */
    select?: SearchEmbeddingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchEmbeddingInclude<ExtArgs> | null
    /**
     * The filter to search for the SearchEmbedding to update in case it exists.
     */
    where: SearchEmbeddingWhereUniqueInput
    /**
     * In case the SearchEmbedding found by the `where` argument doesn't exist, create a new SearchEmbedding with this data.
     */
    create: XOR<SearchEmbeddingCreateInput, SearchEmbeddingUncheckedCreateInput>
    /**
     * In case the SearchEmbedding was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SearchEmbeddingUpdateInput, SearchEmbeddingUncheckedUpdateInput>
  }

  /**
   * SearchEmbedding delete
   */
  export type SearchEmbeddingDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchEmbedding
     */
    select?: SearchEmbeddingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchEmbeddingInclude<ExtArgs> | null
    /**
     * Filter which SearchEmbedding to delete.
     */
    where: SearchEmbeddingWhereUniqueInput
  }

  /**
   * SearchEmbedding deleteMany
   */
  export type SearchEmbeddingDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SearchEmbeddings to delete
     */
    where?: SearchEmbeddingWhereInput
  }

  /**
   * SearchEmbedding without action
   */
  export type SearchEmbeddingDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchEmbedding
     */
    select?: SearchEmbeddingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchEmbeddingInclude<ExtArgs> | null
  }


  /**
   * Model SearchIndexTask
   */

  export type AggregateSearchIndexTask = {
    _count: SearchIndexTaskCountAggregateOutputType | null
    _avg: SearchIndexTaskAvgAggregateOutputType | null
    _sum: SearchIndexTaskSumAggregateOutputType | null
    _min: SearchIndexTaskMinAggregateOutputType | null
    _max: SearchIndexTaskMaxAggregateOutputType | null
  }

  export type SearchIndexTaskAvgAggregateOutputType = {
    sourceVersionNo: number | null
    attemptCount: number | null
    fenceOwnerAttempt: number | null
  }

  export type SearchIndexTaskSumAggregateOutputType = {
    sourceVersionNo: number | null
    attemptCount: number | null
    fenceOwnerAttempt: number | null
  }

  export type SearchIndexTaskMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    researchObjectId: string | null
    artifactId: string | null
    sourceVersionId: string | null
    sourceVersionNo: number | null
    contentHash: string | null
    modelVersionId: string | null
    sourceGenerationSha256: string | null
    sourceCreatedAt: Date | null
    status: string | null
    attemptCount: number | null
    errorCode: string | null
    leaseToken: string | null
    fenceOwnerTaskId: string | null
    fenceOwnerCreatedAt: Date | null
    fenceOwnerAttempt: number | null
    leaseExpiresAt: Date | null
    isCurrent: boolean | null
    createdAt: Date | null
    startedAt: Date | null
    finishedAt: Date | null
  }

  export type SearchIndexTaskMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    researchObjectId: string | null
    artifactId: string | null
    sourceVersionId: string | null
    sourceVersionNo: number | null
    contentHash: string | null
    modelVersionId: string | null
    sourceGenerationSha256: string | null
    sourceCreatedAt: Date | null
    status: string | null
    attemptCount: number | null
    errorCode: string | null
    leaseToken: string | null
    fenceOwnerTaskId: string | null
    fenceOwnerCreatedAt: Date | null
    fenceOwnerAttempt: number | null
    leaseExpiresAt: Date | null
    isCurrent: boolean | null
    createdAt: Date | null
    startedAt: Date | null
    finishedAt: Date | null
  }

  export type SearchIndexTaskCountAggregateOutputType = {
    id: number
    workspaceId: number
    researchObjectId: number
    artifactId: number
    sourceVersionId: number
    sourceVersionNo: number
    contentHash: number
    modelVersionId: number
    sourceGenerationSha256: number
    sourceCreatedAt: number
    status: number
    attemptCount: number
    errorCode: number
    leaseToken: number
    fenceOwnerTaskId: number
    fenceOwnerCreatedAt: number
    fenceOwnerAttempt: number
    leaseExpiresAt: number
    isCurrent: number
    createdAt: number
    startedAt: number
    finishedAt: number
    _all: number
  }


  export type SearchIndexTaskAvgAggregateInputType = {
    sourceVersionNo?: true
    attemptCount?: true
    fenceOwnerAttempt?: true
  }

  export type SearchIndexTaskSumAggregateInputType = {
    sourceVersionNo?: true
    attemptCount?: true
    fenceOwnerAttempt?: true
  }

  export type SearchIndexTaskMinAggregateInputType = {
    id?: true
    workspaceId?: true
    researchObjectId?: true
    artifactId?: true
    sourceVersionId?: true
    sourceVersionNo?: true
    contentHash?: true
    modelVersionId?: true
    sourceGenerationSha256?: true
    sourceCreatedAt?: true
    status?: true
    attemptCount?: true
    errorCode?: true
    leaseToken?: true
    fenceOwnerTaskId?: true
    fenceOwnerCreatedAt?: true
    fenceOwnerAttempt?: true
    leaseExpiresAt?: true
    isCurrent?: true
    createdAt?: true
    startedAt?: true
    finishedAt?: true
  }

  export type SearchIndexTaskMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    researchObjectId?: true
    artifactId?: true
    sourceVersionId?: true
    sourceVersionNo?: true
    contentHash?: true
    modelVersionId?: true
    sourceGenerationSha256?: true
    sourceCreatedAt?: true
    status?: true
    attemptCount?: true
    errorCode?: true
    leaseToken?: true
    fenceOwnerTaskId?: true
    fenceOwnerCreatedAt?: true
    fenceOwnerAttempt?: true
    leaseExpiresAt?: true
    isCurrent?: true
    createdAt?: true
    startedAt?: true
    finishedAt?: true
  }

  export type SearchIndexTaskCountAggregateInputType = {
    id?: true
    workspaceId?: true
    researchObjectId?: true
    artifactId?: true
    sourceVersionId?: true
    sourceVersionNo?: true
    contentHash?: true
    modelVersionId?: true
    sourceGenerationSha256?: true
    sourceCreatedAt?: true
    status?: true
    attemptCount?: true
    errorCode?: true
    leaseToken?: true
    fenceOwnerTaskId?: true
    fenceOwnerCreatedAt?: true
    fenceOwnerAttempt?: true
    leaseExpiresAt?: true
    isCurrent?: true
    createdAt?: true
    startedAt?: true
    finishedAt?: true
    _all?: true
  }

  export type SearchIndexTaskAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SearchIndexTask to aggregate.
     */
    where?: SearchIndexTaskWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchIndexTasks to fetch.
     */
    orderBy?: SearchIndexTaskOrderByWithRelationInput | SearchIndexTaskOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SearchIndexTaskWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchIndexTasks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchIndexTasks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SearchIndexTasks
    **/
    _count?: true | SearchIndexTaskCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SearchIndexTaskAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SearchIndexTaskSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SearchIndexTaskMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SearchIndexTaskMaxAggregateInputType
  }

  export type GetSearchIndexTaskAggregateType<T extends SearchIndexTaskAggregateArgs> = {
        [P in keyof T & keyof AggregateSearchIndexTask]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSearchIndexTask[P]>
      : GetScalarType<T[P], AggregateSearchIndexTask[P]>
  }




  export type SearchIndexTaskGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SearchIndexTaskWhereInput
    orderBy?: SearchIndexTaskOrderByWithAggregationInput | SearchIndexTaskOrderByWithAggregationInput[]
    by: SearchIndexTaskScalarFieldEnum[] | SearchIndexTaskScalarFieldEnum
    having?: SearchIndexTaskScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SearchIndexTaskCountAggregateInputType | true
    _avg?: SearchIndexTaskAvgAggregateInputType
    _sum?: SearchIndexTaskSumAggregateInputType
    _min?: SearchIndexTaskMinAggregateInputType
    _max?: SearchIndexTaskMaxAggregateInputType
  }

  export type SearchIndexTaskGroupByOutputType = {
    id: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId: string
    sourceVersionNo: number
    contentHash: string
    modelVersionId: string
    sourceGenerationSha256: string
    sourceCreatedAt: Date
    status: string
    attemptCount: number
    errorCode: string | null
    leaseToken: string | null
    fenceOwnerTaskId: string | null
    fenceOwnerCreatedAt: Date | null
    fenceOwnerAttempt: number | null
    leaseExpiresAt: Date | null
    isCurrent: boolean
    createdAt: Date
    startedAt: Date | null
    finishedAt: Date | null
    _count: SearchIndexTaskCountAggregateOutputType | null
    _avg: SearchIndexTaskAvgAggregateOutputType | null
    _sum: SearchIndexTaskSumAggregateOutputType | null
    _min: SearchIndexTaskMinAggregateOutputType | null
    _max: SearchIndexTaskMaxAggregateOutputType | null
  }

  type GetSearchIndexTaskGroupByPayload<T extends SearchIndexTaskGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SearchIndexTaskGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SearchIndexTaskGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SearchIndexTaskGroupByOutputType[P]>
            : GetScalarType<T[P], SearchIndexTaskGroupByOutputType[P]>
        }
      >
    >


  export type SearchIndexTaskSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    researchObjectId?: boolean
    artifactId?: boolean
    sourceVersionId?: boolean
    sourceVersionNo?: boolean
    contentHash?: boolean
    modelVersionId?: boolean
    sourceGenerationSha256?: boolean
    sourceCreatedAt?: boolean
    status?: boolean
    attemptCount?: boolean
    errorCode?: boolean
    leaseToken?: boolean
    fenceOwnerTaskId?: boolean
    fenceOwnerCreatedAt?: boolean
    fenceOwnerAttempt?: boolean
    leaseExpiresAt?: boolean
    isCurrent?: boolean
    createdAt?: boolean
    startedAt?: boolean
    finishedAt?: boolean
    modelVersion?: boolean | SearchModelVersionDefaultArgs<ExtArgs>
    chunks?: boolean | SearchIndexTask$chunksArgs<ExtArgs>
    _count?: boolean | SearchIndexTaskCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["searchIndexTask"]>

  export type SearchIndexTaskSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    researchObjectId?: boolean
    artifactId?: boolean
    sourceVersionId?: boolean
    sourceVersionNo?: boolean
    contentHash?: boolean
    modelVersionId?: boolean
    sourceGenerationSha256?: boolean
    sourceCreatedAt?: boolean
    status?: boolean
    attemptCount?: boolean
    errorCode?: boolean
    leaseToken?: boolean
    fenceOwnerTaskId?: boolean
    fenceOwnerCreatedAt?: boolean
    fenceOwnerAttempt?: boolean
    leaseExpiresAt?: boolean
    isCurrent?: boolean
    createdAt?: boolean
    startedAt?: boolean
    finishedAt?: boolean
    modelVersion?: boolean | SearchModelVersionDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["searchIndexTask"]>

  export type SearchIndexTaskSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    researchObjectId?: boolean
    artifactId?: boolean
    sourceVersionId?: boolean
    sourceVersionNo?: boolean
    contentHash?: boolean
    modelVersionId?: boolean
    sourceGenerationSha256?: boolean
    sourceCreatedAt?: boolean
    status?: boolean
    attemptCount?: boolean
    errorCode?: boolean
    leaseToken?: boolean
    fenceOwnerTaskId?: boolean
    fenceOwnerCreatedAt?: boolean
    fenceOwnerAttempt?: boolean
    leaseExpiresAt?: boolean
    isCurrent?: boolean
    createdAt?: boolean
    startedAt?: boolean
    finishedAt?: boolean
  }

  export type SearchIndexTaskInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    modelVersion?: boolean | SearchModelVersionDefaultArgs<ExtArgs>
    chunks?: boolean | SearchIndexTask$chunksArgs<ExtArgs>
    _count?: boolean | SearchIndexTaskCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type SearchIndexTaskIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    modelVersion?: boolean | SearchModelVersionDefaultArgs<ExtArgs>
  }

  export type $SearchIndexTaskPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SearchIndexTask"
    objects: {
      modelVersion: Prisma.$SearchModelVersionPayload<ExtArgs>
      chunks: Prisma.$SearchChunkPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string
      researchObjectId: string
      artifactId: string
      sourceVersionId: string
      sourceVersionNo: number
      contentHash: string
      modelVersionId: string
      sourceGenerationSha256: string
      sourceCreatedAt: Date
      status: string
      attemptCount: number
      errorCode: string | null
      leaseToken: string | null
      fenceOwnerTaskId: string | null
      fenceOwnerCreatedAt: Date | null
      fenceOwnerAttempt: number | null
      leaseExpiresAt: Date | null
      isCurrent: boolean
      createdAt: Date
      startedAt: Date | null
      finishedAt: Date | null
    }, ExtArgs["result"]["searchIndexTask"]>
    composites: {}
  }

  type SearchIndexTaskGetPayload<S extends boolean | null | undefined | SearchIndexTaskDefaultArgs> = $Result.GetResult<Prisma.$SearchIndexTaskPayload, S>

  type SearchIndexTaskCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<SearchIndexTaskFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: SearchIndexTaskCountAggregateInputType | true
    }

  export interface SearchIndexTaskDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SearchIndexTask'], meta: { name: 'SearchIndexTask' } }
    /**
     * Find zero or one SearchIndexTask that matches the filter.
     * @param {SearchIndexTaskFindUniqueArgs} args - Arguments to find a SearchIndexTask
     * @example
     * // Get one SearchIndexTask
     * const searchIndexTask = await prisma.searchIndexTask.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SearchIndexTaskFindUniqueArgs>(args: SelectSubset<T, SearchIndexTaskFindUniqueArgs<ExtArgs>>): Prisma__SearchIndexTaskClient<$Result.GetResult<Prisma.$SearchIndexTaskPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one SearchIndexTask that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {SearchIndexTaskFindUniqueOrThrowArgs} args - Arguments to find a SearchIndexTask
     * @example
     * // Get one SearchIndexTask
     * const searchIndexTask = await prisma.searchIndexTask.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SearchIndexTaskFindUniqueOrThrowArgs>(args: SelectSubset<T, SearchIndexTaskFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SearchIndexTaskClient<$Result.GetResult<Prisma.$SearchIndexTaskPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first SearchIndexTask that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchIndexTaskFindFirstArgs} args - Arguments to find a SearchIndexTask
     * @example
     * // Get one SearchIndexTask
     * const searchIndexTask = await prisma.searchIndexTask.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SearchIndexTaskFindFirstArgs>(args?: SelectSubset<T, SearchIndexTaskFindFirstArgs<ExtArgs>>): Prisma__SearchIndexTaskClient<$Result.GetResult<Prisma.$SearchIndexTaskPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first SearchIndexTask that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchIndexTaskFindFirstOrThrowArgs} args - Arguments to find a SearchIndexTask
     * @example
     * // Get one SearchIndexTask
     * const searchIndexTask = await prisma.searchIndexTask.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SearchIndexTaskFindFirstOrThrowArgs>(args?: SelectSubset<T, SearchIndexTaskFindFirstOrThrowArgs<ExtArgs>>): Prisma__SearchIndexTaskClient<$Result.GetResult<Prisma.$SearchIndexTaskPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more SearchIndexTasks that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchIndexTaskFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SearchIndexTasks
     * const searchIndexTasks = await prisma.searchIndexTask.findMany()
     * 
     * // Get first 10 SearchIndexTasks
     * const searchIndexTasks = await prisma.searchIndexTask.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const searchIndexTaskWithIdOnly = await prisma.searchIndexTask.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SearchIndexTaskFindManyArgs>(args?: SelectSubset<T, SearchIndexTaskFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchIndexTaskPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a SearchIndexTask.
     * @param {SearchIndexTaskCreateArgs} args - Arguments to create a SearchIndexTask.
     * @example
     * // Create one SearchIndexTask
     * const SearchIndexTask = await prisma.searchIndexTask.create({
     *   data: {
     *     // ... data to create a SearchIndexTask
     *   }
     * })
     * 
     */
    create<T extends SearchIndexTaskCreateArgs>(args: SelectSubset<T, SearchIndexTaskCreateArgs<ExtArgs>>): Prisma__SearchIndexTaskClient<$Result.GetResult<Prisma.$SearchIndexTaskPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many SearchIndexTasks.
     * @param {SearchIndexTaskCreateManyArgs} args - Arguments to create many SearchIndexTasks.
     * @example
     * // Create many SearchIndexTasks
     * const searchIndexTask = await prisma.searchIndexTask.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SearchIndexTaskCreateManyArgs>(args?: SelectSubset<T, SearchIndexTaskCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SearchIndexTasks and returns the data saved in the database.
     * @param {SearchIndexTaskCreateManyAndReturnArgs} args - Arguments to create many SearchIndexTasks.
     * @example
     * // Create many SearchIndexTasks
     * const searchIndexTask = await prisma.searchIndexTask.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SearchIndexTasks and only return the `id`
     * const searchIndexTaskWithIdOnly = await prisma.searchIndexTask.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SearchIndexTaskCreateManyAndReturnArgs>(args?: SelectSubset<T, SearchIndexTaskCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchIndexTaskPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a SearchIndexTask.
     * @param {SearchIndexTaskDeleteArgs} args - Arguments to delete one SearchIndexTask.
     * @example
     * // Delete one SearchIndexTask
     * const SearchIndexTask = await prisma.searchIndexTask.delete({
     *   where: {
     *     // ... filter to delete one SearchIndexTask
     *   }
     * })
     * 
     */
    delete<T extends SearchIndexTaskDeleteArgs>(args: SelectSubset<T, SearchIndexTaskDeleteArgs<ExtArgs>>): Prisma__SearchIndexTaskClient<$Result.GetResult<Prisma.$SearchIndexTaskPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one SearchIndexTask.
     * @param {SearchIndexTaskUpdateArgs} args - Arguments to update one SearchIndexTask.
     * @example
     * // Update one SearchIndexTask
     * const searchIndexTask = await prisma.searchIndexTask.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SearchIndexTaskUpdateArgs>(args: SelectSubset<T, SearchIndexTaskUpdateArgs<ExtArgs>>): Prisma__SearchIndexTaskClient<$Result.GetResult<Prisma.$SearchIndexTaskPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more SearchIndexTasks.
     * @param {SearchIndexTaskDeleteManyArgs} args - Arguments to filter SearchIndexTasks to delete.
     * @example
     * // Delete a few SearchIndexTasks
     * const { count } = await prisma.searchIndexTask.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SearchIndexTaskDeleteManyArgs>(args?: SelectSubset<T, SearchIndexTaskDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SearchIndexTasks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchIndexTaskUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SearchIndexTasks
     * const searchIndexTask = await prisma.searchIndexTask.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SearchIndexTaskUpdateManyArgs>(args: SelectSubset<T, SearchIndexTaskUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one SearchIndexTask.
     * @param {SearchIndexTaskUpsertArgs} args - Arguments to update or create a SearchIndexTask.
     * @example
     * // Update or create a SearchIndexTask
     * const searchIndexTask = await prisma.searchIndexTask.upsert({
     *   create: {
     *     // ... data to create a SearchIndexTask
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SearchIndexTask we want to update
     *   }
     * })
     */
    upsert<T extends SearchIndexTaskUpsertArgs>(args: SelectSubset<T, SearchIndexTaskUpsertArgs<ExtArgs>>): Prisma__SearchIndexTaskClient<$Result.GetResult<Prisma.$SearchIndexTaskPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of SearchIndexTasks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchIndexTaskCountArgs} args - Arguments to filter SearchIndexTasks to count.
     * @example
     * // Count the number of SearchIndexTasks
     * const count = await prisma.searchIndexTask.count({
     *   where: {
     *     // ... the filter for the SearchIndexTasks we want to count
     *   }
     * })
    **/
    count<T extends SearchIndexTaskCountArgs>(
      args?: Subset<T, SearchIndexTaskCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SearchIndexTaskCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SearchIndexTask.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchIndexTaskAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SearchIndexTaskAggregateArgs>(args: Subset<T, SearchIndexTaskAggregateArgs>): Prisma.PrismaPromise<GetSearchIndexTaskAggregateType<T>>

    /**
     * Group by SearchIndexTask.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchIndexTaskGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SearchIndexTaskGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SearchIndexTaskGroupByArgs['orderBy'] }
        : { orderBy?: SearchIndexTaskGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SearchIndexTaskGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSearchIndexTaskGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SearchIndexTask model
   */
  readonly fields: SearchIndexTaskFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SearchIndexTask.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SearchIndexTaskClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    modelVersion<T extends SearchModelVersionDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SearchModelVersionDefaultArgs<ExtArgs>>): Prisma__SearchModelVersionClient<$Result.GetResult<Prisma.$SearchModelVersionPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    chunks<T extends SearchIndexTask$chunksArgs<ExtArgs> = {}>(args?: Subset<T, SearchIndexTask$chunksArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchChunkPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SearchIndexTask model
   */ 
  interface SearchIndexTaskFieldRefs {
    readonly id: FieldRef<"SearchIndexTask", 'String'>
    readonly workspaceId: FieldRef<"SearchIndexTask", 'String'>
    readonly researchObjectId: FieldRef<"SearchIndexTask", 'String'>
    readonly artifactId: FieldRef<"SearchIndexTask", 'String'>
    readonly sourceVersionId: FieldRef<"SearchIndexTask", 'String'>
    readonly sourceVersionNo: FieldRef<"SearchIndexTask", 'Int'>
    readonly contentHash: FieldRef<"SearchIndexTask", 'String'>
    readonly modelVersionId: FieldRef<"SearchIndexTask", 'String'>
    readonly sourceGenerationSha256: FieldRef<"SearchIndexTask", 'String'>
    readonly sourceCreatedAt: FieldRef<"SearchIndexTask", 'DateTime'>
    readonly status: FieldRef<"SearchIndexTask", 'String'>
    readonly attemptCount: FieldRef<"SearchIndexTask", 'Int'>
    readonly errorCode: FieldRef<"SearchIndexTask", 'String'>
    readonly leaseToken: FieldRef<"SearchIndexTask", 'String'>
    readonly fenceOwnerTaskId: FieldRef<"SearchIndexTask", 'String'>
    readonly fenceOwnerCreatedAt: FieldRef<"SearchIndexTask", 'DateTime'>
    readonly fenceOwnerAttempt: FieldRef<"SearchIndexTask", 'Int'>
    readonly leaseExpiresAt: FieldRef<"SearchIndexTask", 'DateTime'>
    readonly isCurrent: FieldRef<"SearchIndexTask", 'Boolean'>
    readonly createdAt: FieldRef<"SearchIndexTask", 'DateTime'>
    readonly startedAt: FieldRef<"SearchIndexTask", 'DateTime'>
    readonly finishedAt: FieldRef<"SearchIndexTask", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SearchIndexTask findUnique
   */
  export type SearchIndexTaskFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTask
     */
    select?: SearchIndexTaskSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchIndexTaskInclude<ExtArgs> | null
    /**
     * Filter, which SearchIndexTask to fetch.
     */
    where: SearchIndexTaskWhereUniqueInput
  }

  /**
   * SearchIndexTask findUniqueOrThrow
   */
  export type SearchIndexTaskFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTask
     */
    select?: SearchIndexTaskSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchIndexTaskInclude<ExtArgs> | null
    /**
     * Filter, which SearchIndexTask to fetch.
     */
    where: SearchIndexTaskWhereUniqueInput
  }

  /**
   * SearchIndexTask findFirst
   */
  export type SearchIndexTaskFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTask
     */
    select?: SearchIndexTaskSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchIndexTaskInclude<ExtArgs> | null
    /**
     * Filter, which SearchIndexTask to fetch.
     */
    where?: SearchIndexTaskWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchIndexTasks to fetch.
     */
    orderBy?: SearchIndexTaskOrderByWithRelationInput | SearchIndexTaskOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SearchIndexTasks.
     */
    cursor?: SearchIndexTaskWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchIndexTasks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchIndexTasks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SearchIndexTasks.
     */
    distinct?: SearchIndexTaskScalarFieldEnum | SearchIndexTaskScalarFieldEnum[]
  }

  /**
   * SearchIndexTask findFirstOrThrow
   */
  export type SearchIndexTaskFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTask
     */
    select?: SearchIndexTaskSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchIndexTaskInclude<ExtArgs> | null
    /**
     * Filter, which SearchIndexTask to fetch.
     */
    where?: SearchIndexTaskWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchIndexTasks to fetch.
     */
    orderBy?: SearchIndexTaskOrderByWithRelationInput | SearchIndexTaskOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SearchIndexTasks.
     */
    cursor?: SearchIndexTaskWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchIndexTasks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchIndexTasks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SearchIndexTasks.
     */
    distinct?: SearchIndexTaskScalarFieldEnum | SearchIndexTaskScalarFieldEnum[]
  }

  /**
   * SearchIndexTask findMany
   */
  export type SearchIndexTaskFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTask
     */
    select?: SearchIndexTaskSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchIndexTaskInclude<ExtArgs> | null
    /**
     * Filter, which SearchIndexTasks to fetch.
     */
    where?: SearchIndexTaskWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchIndexTasks to fetch.
     */
    orderBy?: SearchIndexTaskOrderByWithRelationInput | SearchIndexTaskOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SearchIndexTasks.
     */
    cursor?: SearchIndexTaskWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchIndexTasks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchIndexTasks.
     */
    skip?: number
    distinct?: SearchIndexTaskScalarFieldEnum | SearchIndexTaskScalarFieldEnum[]
  }

  /**
   * SearchIndexTask create
   */
  export type SearchIndexTaskCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTask
     */
    select?: SearchIndexTaskSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchIndexTaskInclude<ExtArgs> | null
    /**
     * The data needed to create a SearchIndexTask.
     */
    data: XOR<SearchIndexTaskCreateInput, SearchIndexTaskUncheckedCreateInput>
  }

  /**
   * SearchIndexTask createMany
   */
  export type SearchIndexTaskCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SearchIndexTasks.
     */
    data: SearchIndexTaskCreateManyInput | SearchIndexTaskCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SearchIndexTask createManyAndReturn
   */
  export type SearchIndexTaskCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTask
     */
    select?: SearchIndexTaskSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many SearchIndexTasks.
     */
    data: SearchIndexTaskCreateManyInput | SearchIndexTaskCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchIndexTaskIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SearchIndexTask update
   */
  export type SearchIndexTaskUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTask
     */
    select?: SearchIndexTaskSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchIndexTaskInclude<ExtArgs> | null
    /**
     * The data needed to update a SearchIndexTask.
     */
    data: XOR<SearchIndexTaskUpdateInput, SearchIndexTaskUncheckedUpdateInput>
    /**
     * Choose, which SearchIndexTask to update.
     */
    where: SearchIndexTaskWhereUniqueInput
  }

  /**
   * SearchIndexTask updateMany
   */
  export type SearchIndexTaskUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SearchIndexTasks.
     */
    data: XOR<SearchIndexTaskUpdateManyMutationInput, SearchIndexTaskUncheckedUpdateManyInput>
    /**
     * Filter which SearchIndexTasks to update
     */
    where?: SearchIndexTaskWhereInput
  }

  /**
   * SearchIndexTask upsert
   */
  export type SearchIndexTaskUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTask
     */
    select?: SearchIndexTaskSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchIndexTaskInclude<ExtArgs> | null
    /**
     * The filter to search for the SearchIndexTask to update in case it exists.
     */
    where: SearchIndexTaskWhereUniqueInput
    /**
     * In case the SearchIndexTask found by the `where` argument doesn't exist, create a new SearchIndexTask with this data.
     */
    create: XOR<SearchIndexTaskCreateInput, SearchIndexTaskUncheckedCreateInput>
    /**
     * In case the SearchIndexTask was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SearchIndexTaskUpdateInput, SearchIndexTaskUncheckedUpdateInput>
  }

  /**
   * SearchIndexTask delete
   */
  export type SearchIndexTaskDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTask
     */
    select?: SearchIndexTaskSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchIndexTaskInclude<ExtArgs> | null
    /**
     * Filter which SearchIndexTask to delete.
     */
    where: SearchIndexTaskWhereUniqueInput
  }

  /**
   * SearchIndexTask deleteMany
   */
  export type SearchIndexTaskDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SearchIndexTasks to delete
     */
    where?: SearchIndexTaskWhereInput
  }

  /**
   * SearchIndexTask.chunks
   */
  export type SearchIndexTask$chunksArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchChunk
     */
    select?: SearchChunkSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchChunkInclude<ExtArgs> | null
    where?: SearchChunkWhereInput
    orderBy?: SearchChunkOrderByWithRelationInput | SearchChunkOrderByWithRelationInput[]
    cursor?: SearchChunkWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SearchChunkScalarFieldEnum | SearchChunkScalarFieldEnum[]
  }

  /**
   * SearchIndexTask without action
   */
  export type SearchIndexTaskDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchIndexTask
     */
    select?: SearchIndexTaskSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SearchIndexTaskInclude<ExtArgs> | null
  }


  /**
   * Model SearchQueryMetric
   */

  export type AggregateSearchQueryMetric = {
    _count: SearchQueryMetricCountAggregateOutputType | null
    _avg: SearchQueryMetricAvgAggregateOutputType | null
    _sum: SearchQueryMetricSumAggregateOutputType | null
    _min: SearchQueryMetricMinAggregateOutputType | null
    _max: SearchQueryMetricMaxAggregateOutputType | null
  }

  export type SearchQueryMetricAvgAggregateOutputType = {
    resultCount: number | null
    lexicalLatencyMs: number | null
    denseLatencyMs: number | null
    totalLatencyMs: number | null
  }

  export type SearchQueryMetricSumAggregateOutputType = {
    resultCount: number | null
    lexicalLatencyMs: number | null
    denseLatencyMs: number | null
    totalLatencyMs: number | null
  }

  export type SearchQueryMetricMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    queryHash: string | null
    lexicalAvailable: boolean | null
    denseAvailable: boolean | null
    resultCount: number | null
    lexicalLatencyMs: number | null
    denseLatencyMs: number | null
    totalLatencyMs: number | null
    errorCode: string | null
    createdAt: Date | null
  }

  export type SearchQueryMetricMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    queryHash: string | null
    lexicalAvailable: boolean | null
    denseAvailable: boolean | null
    resultCount: number | null
    lexicalLatencyMs: number | null
    denseLatencyMs: number | null
    totalLatencyMs: number | null
    errorCode: string | null
    createdAt: Date | null
  }

  export type SearchQueryMetricCountAggregateOutputType = {
    id: number
    workspaceId: number
    queryHash: number
    lexicalAvailable: number
    denseAvailable: number
    resultCount: number
    lexicalLatencyMs: number
    denseLatencyMs: number
    totalLatencyMs: number
    errorCode: number
    createdAt: number
    _all: number
  }


  export type SearchQueryMetricAvgAggregateInputType = {
    resultCount?: true
    lexicalLatencyMs?: true
    denseLatencyMs?: true
    totalLatencyMs?: true
  }

  export type SearchQueryMetricSumAggregateInputType = {
    resultCount?: true
    lexicalLatencyMs?: true
    denseLatencyMs?: true
    totalLatencyMs?: true
  }

  export type SearchQueryMetricMinAggregateInputType = {
    id?: true
    workspaceId?: true
    queryHash?: true
    lexicalAvailable?: true
    denseAvailable?: true
    resultCount?: true
    lexicalLatencyMs?: true
    denseLatencyMs?: true
    totalLatencyMs?: true
    errorCode?: true
    createdAt?: true
  }

  export type SearchQueryMetricMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    queryHash?: true
    lexicalAvailable?: true
    denseAvailable?: true
    resultCount?: true
    lexicalLatencyMs?: true
    denseLatencyMs?: true
    totalLatencyMs?: true
    errorCode?: true
    createdAt?: true
  }

  export type SearchQueryMetricCountAggregateInputType = {
    id?: true
    workspaceId?: true
    queryHash?: true
    lexicalAvailable?: true
    denseAvailable?: true
    resultCount?: true
    lexicalLatencyMs?: true
    denseLatencyMs?: true
    totalLatencyMs?: true
    errorCode?: true
    createdAt?: true
    _all?: true
  }

  export type SearchQueryMetricAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SearchQueryMetric to aggregate.
     */
    where?: SearchQueryMetricWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchQueryMetrics to fetch.
     */
    orderBy?: SearchQueryMetricOrderByWithRelationInput | SearchQueryMetricOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SearchQueryMetricWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchQueryMetrics from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchQueryMetrics.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SearchQueryMetrics
    **/
    _count?: true | SearchQueryMetricCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SearchQueryMetricAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SearchQueryMetricSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SearchQueryMetricMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SearchQueryMetricMaxAggregateInputType
  }

  export type GetSearchQueryMetricAggregateType<T extends SearchQueryMetricAggregateArgs> = {
        [P in keyof T & keyof AggregateSearchQueryMetric]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSearchQueryMetric[P]>
      : GetScalarType<T[P], AggregateSearchQueryMetric[P]>
  }




  export type SearchQueryMetricGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SearchQueryMetricWhereInput
    orderBy?: SearchQueryMetricOrderByWithAggregationInput | SearchQueryMetricOrderByWithAggregationInput[]
    by: SearchQueryMetricScalarFieldEnum[] | SearchQueryMetricScalarFieldEnum
    having?: SearchQueryMetricScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SearchQueryMetricCountAggregateInputType | true
    _avg?: SearchQueryMetricAvgAggregateInputType
    _sum?: SearchQueryMetricSumAggregateInputType
    _min?: SearchQueryMetricMinAggregateInputType
    _max?: SearchQueryMetricMaxAggregateInputType
  }

  export type SearchQueryMetricGroupByOutputType = {
    id: string
    workspaceId: string
    queryHash: string
    lexicalAvailable: boolean
    denseAvailable: boolean
    resultCount: number
    lexicalLatencyMs: number | null
    denseLatencyMs: number | null
    totalLatencyMs: number
    errorCode: string | null
    createdAt: Date
    _count: SearchQueryMetricCountAggregateOutputType | null
    _avg: SearchQueryMetricAvgAggregateOutputType | null
    _sum: SearchQueryMetricSumAggregateOutputType | null
    _min: SearchQueryMetricMinAggregateOutputType | null
    _max: SearchQueryMetricMaxAggregateOutputType | null
  }

  type GetSearchQueryMetricGroupByPayload<T extends SearchQueryMetricGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SearchQueryMetricGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SearchQueryMetricGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SearchQueryMetricGroupByOutputType[P]>
            : GetScalarType<T[P], SearchQueryMetricGroupByOutputType[P]>
        }
      >
    >


  export type SearchQueryMetricSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    queryHash?: boolean
    lexicalAvailable?: boolean
    denseAvailable?: boolean
    resultCount?: boolean
    lexicalLatencyMs?: boolean
    denseLatencyMs?: boolean
    totalLatencyMs?: boolean
    errorCode?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["searchQueryMetric"]>

  export type SearchQueryMetricSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    queryHash?: boolean
    lexicalAvailable?: boolean
    denseAvailable?: boolean
    resultCount?: boolean
    lexicalLatencyMs?: boolean
    denseLatencyMs?: boolean
    totalLatencyMs?: boolean
    errorCode?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["searchQueryMetric"]>

  export type SearchQueryMetricSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    queryHash?: boolean
    lexicalAvailable?: boolean
    denseAvailable?: boolean
    resultCount?: boolean
    lexicalLatencyMs?: boolean
    denseLatencyMs?: boolean
    totalLatencyMs?: boolean
    errorCode?: boolean
    createdAt?: boolean
  }


  export type $SearchQueryMetricPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SearchQueryMetric"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string
      queryHash: string
      lexicalAvailable: boolean
      denseAvailable: boolean
      resultCount: number
      lexicalLatencyMs: number | null
      denseLatencyMs: number | null
      totalLatencyMs: number
      errorCode: string | null
      createdAt: Date
    }, ExtArgs["result"]["searchQueryMetric"]>
    composites: {}
  }

  type SearchQueryMetricGetPayload<S extends boolean | null | undefined | SearchQueryMetricDefaultArgs> = $Result.GetResult<Prisma.$SearchQueryMetricPayload, S>

  type SearchQueryMetricCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<SearchQueryMetricFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: SearchQueryMetricCountAggregateInputType | true
    }

  export interface SearchQueryMetricDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SearchQueryMetric'], meta: { name: 'SearchQueryMetric' } }
    /**
     * Find zero or one SearchQueryMetric that matches the filter.
     * @param {SearchQueryMetricFindUniqueArgs} args - Arguments to find a SearchQueryMetric
     * @example
     * // Get one SearchQueryMetric
     * const searchQueryMetric = await prisma.searchQueryMetric.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SearchQueryMetricFindUniqueArgs>(args: SelectSubset<T, SearchQueryMetricFindUniqueArgs<ExtArgs>>): Prisma__SearchQueryMetricClient<$Result.GetResult<Prisma.$SearchQueryMetricPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one SearchQueryMetric that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {SearchQueryMetricFindUniqueOrThrowArgs} args - Arguments to find a SearchQueryMetric
     * @example
     * // Get one SearchQueryMetric
     * const searchQueryMetric = await prisma.searchQueryMetric.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SearchQueryMetricFindUniqueOrThrowArgs>(args: SelectSubset<T, SearchQueryMetricFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SearchQueryMetricClient<$Result.GetResult<Prisma.$SearchQueryMetricPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first SearchQueryMetric that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchQueryMetricFindFirstArgs} args - Arguments to find a SearchQueryMetric
     * @example
     * // Get one SearchQueryMetric
     * const searchQueryMetric = await prisma.searchQueryMetric.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SearchQueryMetricFindFirstArgs>(args?: SelectSubset<T, SearchQueryMetricFindFirstArgs<ExtArgs>>): Prisma__SearchQueryMetricClient<$Result.GetResult<Prisma.$SearchQueryMetricPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first SearchQueryMetric that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchQueryMetricFindFirstOrThrowArgs} args - Arguments to find a SearchQueryMetric
     * @example
     * // Get one SearchQueryMetric
     * const searchQueryMetric = await prisma.searchQueryMetric.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SearchQueryMetricFindFirstOrThrowArgs>(args?: SelectSubset<T, SearchQueryMetricFindFirstOrThrowArgs<ExtArgs>>): Prisma__SearchQueryMetricClient<$Result.GetResult<Prisma.$SearchQueryMetricPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more SearchQueryMetrics that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchQueryMetricFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SearchQueryMetrics
     * const searchQueryMetrics = await prisma.searchQueryMetric.findMany()
     * 
     * // Get first 10 SearchQueryMetrics
     * const searchQueryMetrics = await prisma.searchQueryMetric.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const searchQueryMetricWithIdOnly = await prisma.searchQueryMetric.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SearchQueryMetricFindManyArgs>(args?: SelectSubset<T, SearchQueryMetricFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchQueryMetricPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a SearchQueryMetric.
     * @param {SearchQueryMetricCreateArgs} args - Arguments to create a SearchQueryMetric.
     * @example
     * // Create one SearchQueryMetric
     * const SearchQueryMetric = await prisma.searchQueryMetric.create({
     *   data: {
     *     // ... data to create a SearchQueryMetric
     *   }
     * })
     * 
     */
    create<T extends SearchQueryMetricCreateArgs>(args: SelectSubset<T, SearchQueryMetricCreateArgs<ExtArgs>>): Prisma__SearchQueryMetricClient<$Result.GetResult<Prisma.$SearchQueryMetricPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many SearchQueryMetrics.
     * @param {SearchQueryMetricCreateManyArgs} args - Arguments to create many SearchQueryMetrics.
     * @example
     * // Create many SearchQueryMetrics
     * const searchQueryMetric = await prisma.searchQueryMetric.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SearchQueryMetricCreateManyArgs>(args?: SelectSubset<T, SearchQueryMetricCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SearchQueryMetrics and returns the data saved in the database.
     * @param {SearchQueryMetricCreateManyAndReturnArgs} args - Arguments to create many SearchQueryMetrics.
     * @example
     * // Create many SearchQueryMetrics
     * const searchQueryMetric = await prisma.searchQueryMetric.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SearchQueryMetrics and only return the `id`
     * const searchQueryMetricWithIdOnly = await prisma.searchQueryMetric.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SearchQueryMetricCreateManyAndReturnArgs>(args?: SelectSubset<T, SearchQueryMetricCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SearchQueryMetricPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a SearchQueryMetric.
     * @param {SearchQueryMetricDeleteArgs} args - Arguments to delete one SearchQueryMetric.
     * @example
     * // Delete one SearchQueryMetric
     * const SearchQueryMetric = await prisma.searchQueryMetric.delete({
     *   where: {
     *     // ... filter to delete one SearchQueryMetric
     *   }
     * })
     * 
     */
    delete<T extends SearchQueryMetricDeleteArgs>(args: SelectSubset<T, SearchQueryMetricDeleteArgs<ExtArgs>>): Prisma__SearchQueryMetricClient<$Result.GetResult<Prisma.$SearchQueryMetricPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one SearchQueryMetric.
     * @param {SearchQueryMetricUpdateArgs} args - Arguments to update one SearchQueryMetric.
     * @example
     * // Update one SearchQueryMetric
     * const searchQueryMetric = await prisma.searchQueryMetric.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SearchQueryMetricUpdateArgs>(args: SelectSubset<T, SearchQueryMetricUpdateArgs<ExtArgs>>): Prisma__SearchQueryMetricClient<$Result.GetResult<Prisma.$SearchQueryMetricPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more SearchQueryMetrics.
     * @param {SearchQueryMetricDeleteManyArgs} args - Arguments to filter SearchQueryMetrics to delete.
     * @example
     * // Delete a few SearchQueryMetrics
     * const { count } = await prisma.searchQueryMetric.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SearchQueryMetricDeleteManyArgs>(args?: SelectSubset<T, SearchQueryMetricDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SearchQueryMetrics.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchQueryMetricUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SearchQueryMetrics
     * const searchQueryMetric = await prisma.searchQueryMetric.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SearchQueryMetricUpdateManyArgs>(args: SelectSubset<T, SearchQueryMetricUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one SearchQueryMetric.
     * @param {SearchQueryMetricUpsertArgs} args - Arguments to update or create a SearchQueryMetric.
     * @example
     * // Update or create a SearchQueryMetric
     * const searchQueryMetric = await prisma.searchQueryMetric.upsert({
     *   create: {
     *     // ... data to create a SearchQueryMetric
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SearchQueryMetric we want to update
     *   }
     * })
     */
    upsert<T extends SearchQueryMetricUpsertArgs>(args: SelectSubset<T, SearchQueryMetricUpsertArgs<ExtArgs>>): Prisma__SearchQueryMetricClient<$Result.GetResult<Prisma.$SearchQueryMetricPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of SearchQueryMetrics.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchQueryMetricCountArgs} args - Arguments to filter SearchQueryMetrics to count.
     * @example
     * // Count the number of SearchQueryMetrics
     * const count = await prisma.searchQueryMetric.count({
     *   where: {
     *     // ... the filter for the SearchQueryMetrics we want to count
     *   }
     * })
    **/
    count<T extends SearchQueryMetricCountArgs>(
      args?: Subset<T, SearchQueryMetricCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SearchQueryMetricCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SearchQueryMetric.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchQueryMetricAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SearchQueryMetricAggregateArgs>(args: Subset<T, SearchQueryMetricAggregateArgs>): Prisma.PrismaPromise<GetSearchQueryMetricAggregateType<T>>

    /**
     * Group by SearchQueryMetric.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SearchQueryMetricGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SearchQueryMetricGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SearchQueryMetricGroupByArgs['orderBy'] }
        : { orderBy?: SearchQueryMetricGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SearchQueryMetricGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSearchQueryMetricGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SearchQueryMetric model
   */
  readonly fields: SearchQueryMetricFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SearchQueryMetric.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SearchQueryMetricClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SearchQueryMetric model
   */ 
  interface SearchQueryMetricFieldRefs {
    readonly id: FieldRef<"SearchQueryMetric", 'String'>
    readonly workspaceId: FieldRef<"SearchQueryMetric", 'String'>
    readonly queryHash: FieldRef<"SearchQueryMetric", 'String'>
    readonly lexicalAvailable: FieldRef<"SearchQueryMetric", 'Boolean'>
    readonly denseAvailable: FieldRef<"SearchQueryMetric", 'Boolean'>
    readonly resultCount: FieldRef<"SearchQueryMetric", 'Int'>
    readonly lexicalLatencyMs: FieldRef<"SearchQueryMetric", 'Int'>
    readonly denseLatencyMs: FieldRef<"SearchQueryMetric", 'Int'>
    readonly totalLatencyMs: FieldRef<"SearchQueryMetric", 'Int'>
    readonly errorCode: FieldRef<"SearchQueryMetric", 'String'>
    readonly createdAt: FieldRef<"SearchQueryMetric", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SearchQueryMetric findUnique
   */
  export type SearchQueryMetricFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchQueryMetric
     */
    select?: SearchQueryMetricSelect<ExtArgs> | null
    /**
     * Filter, which SearchQueryMetric to fetch.
     */
    where: SearchQueryMetricWhereUniqueInput
  }

  /**
   * SearchQueryMetric findUniqueOrThrow
   */
  export type SearchQueryMetricFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchQueryMetric
     */
    select?: SearchQueryMetricSelect<ExtArgs> | null
    /**
     * Filter, which SearchQueryMetric to fetch.
     */
    where: SearchQueryMetricWhereUniqueInput
  }

  /**
   * SearchQueryMetric findFirst
   */
  export type SearchQueryMetricFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchQueryMetric
     */
    select?: SearchQueryMetricSelect<ExtArgs> | null
    /**
     * Filter, which SearchQueryMetric to fetch.
     */
    where?: SearchQueryMetricWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchQueryMetrics to fetch.
     */
    orderBy?: SearchQueryMetricOrderByWithRelationInput | SearchQueryMetricOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SearchQueryMetrics.
     */
    cursor?: SearchQueryMetricWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchQueryMetrics from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchQueryMetrics.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SearchQueryMetrics.
     */
    distinct?: SearchQueryMetricScalarFieldEnum | SearchQueryMetricScalarFieldEnum[]
  }

  /**
   * SearchQueryMetric findFirstOrThrow
   */
  export type SearchQueryMetricFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchQueryMetric
     */
    select?: SearchQueryMetricSelect<ExtArgs> | null
    /**
     * Filter, which SearchQueryMetric to fetch.
     */
    where?: SearchQueryMetricWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchQueryMetrics to fetch.
     */
    orderBy?: SearchQueryMetricOrderByWithRelationInput | SearchQueryMetricOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SearchQueryMetrics.
     */
    cursor?: SearchQueryMetricWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchQueryMetrics from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchQueryMetrics.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SearchQueryMetrics.
     */
    distinct?: SearchQueryMetricScalarFieldEnum | SearchQueryMetricScalarFieldEnum[]
  }

  /**
   * SearchQueryMetric findMany
   */
  export type SearchQueryMetricFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchQueryMetric
     */
    select?: SearchQueryMetricSelect<ExtArgs> | null
    /**
     * Filter, which SearchQueryMetrics to fetch.
     */
    where?: SearchQueryMetricWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SearchQueryMetrics to fetch.
     */
    orderBy?: SearchQueryMetricOrderByWithRelationInput | SearchQueryMetricOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SearchQueryMetrics.
     */
    cursor?: SearchQueryMetricWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SearchQueryMetrics from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SearchQueryMetrics.
     */
    skip?: number
    distinct?: SearchQueryMetricScalarFieldEnum | SearchQueryMetricScalarFieldEnum[]
  }

  /**
   * SearchQueryMetric create
   */
  export type SearchQueryMetricCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchQueryMetric
     */
    select?: SearchQueryMetricSelect<ExtArgs> | null
    /**
     * The data needed to create a SearchQueryMetric.
     */
    data: XOR<SearchQueryMetricCreateInput, SearchQueryMetricUncheckedCreateInput>
  }

  /**
   * SearchQueryMetric createMany
   */
  export type SearchQueryMetricCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SearchQueryMetrics.
     */
    data: SearchQueryMetricCreateManyInput | SearchQueryMetricCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SearchQueryMetric createManyAndReturn
   */
  export type SearchQueryMetricCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchQueryMetric
     */
    select?: SearchQueryMetricSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many SearchQueryMetrics.
     */
    data: SearchQueryMetricCreateManyInput | SearchQueryMetricCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SearchQueryMetric update
   */
  export type SearchQueryMetricUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchQueryMetric
     */
    select?: SearchQueryMetricSelect<ExtArgs> | null
    /**
     * The data needed to update a SearchQueryMetric.
     */
    data: XOR<SearchQueryMetricUpdateInput, SearchQueryMetricUncheckedUpdateInput>
    /**
     * Choose, which SearchQueryMetric to update.
     */
    where: SearchQueryMetricWhereUniqueInput
  }

  /**
   * SearchQueryMetric updateMany
   */
  export type SearchQueryMetricUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SearchQueryMetrics.
     */
    data: XOR<SearchQueryMetricUpdateManyMutationInput, SearchQueryMetricUncheckedUpdateManyInput>
    /**
     * Filter which SearchQueryMetrics to update
     */
    where?: SearchQueryMetricWhereInput
  }

  /**
   * SearchQueryMetric upsert
   */
  export type SearchQueryMetricUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchQueryMetric
     */
    select?: SearchQueryMetricSelect<ExtArgs> | null
    /**
     * The filter to search for the SearchQueryMetric to update in case it exists.
     */
    where: SearchQueryMetricWhereUniqueInput
    /**
     * In case the SearchQueryMetric found by the `where` argument doesn't exist, create a new SearchQueryMetric with this data.
     */
    create: XOR<SearchQueryMetricCreateInput, SearchQueryMetricUncheckedCreateInput>
    /**
     * In case the SearchQueryMetric was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SearchQueryMetricUpdateInput, SearchQueryMetricUncheckedUpdateInput>
  }

  /**
   * SearchQueryMetric delete
   */
  export type SearchQueryMetricDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchQueryMetric
     */
    select?: SearchQueryMetricSelect<ExtArgs> | null
    /**
     * Filter which SearchQueryMetric to delete.
     */
    where: SearchQueryMetricWhereUniqueInput
  }

  /**
   * SearchQueryMetric deleteMany
   */
  export type SearchQueryMetricDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SearchQueryMetrics to delete
     */
    where?: SearchQueryMetricWhereInput
  }

  /**
   * SearchQueryMetric without action
   */
  export type SearchQueryMetricDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SearchQueryMetric
     */
    select?: SearchQueryMetricSelect<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const SearchSchemaMetaScalarFieldEnum: {
    key: 'key',
    value: 'value',
    updatedAt: 'updatedAt'
  };

  export type SearchSchemaMetaScalarFieldEnum = (typeof SearchSchemaMetaScalarFieldEnum)[keyof typeof SearchSchemaMetaScalarFieldEnum]


  export const SearchModelVersionScalarFieldEnum: {
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

  export type SearchModelVersionScalarFieldEnum = (typeof SearchModelVersionScalarFieldEnum)[keyof typeof SearchModelVersionScalarFieldEnum]


  export const SearchChunkScalarFieldEnum: {
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

  export type SearchChunkScalarFieldEnum = (typeof SearchChunkScalarFieldEnum)[keyof typeof SearchChunkScalarFieldEnum]


  export const SearchEmbeddingScalarFieldEnum: {
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

  export type SearchEmbeddingScalarFieldEnum = (typeof SearchEmbeddingScalarFieldEnum)[keyof typeof SearchEmbeddingScalarFieldEnum]


  export const SearchIndexTaskScalarFieldEnum: {
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

  export type SearchIndexTaskScalarFieldEnum = (typeof SearchIndexTaskScalarFieldEnum)[keyof typeof SearchIndexTaskScalarFieldEnum]


  export const SearchQueryMetricScalarFieldEnum: {
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

  export type SearchQueryMetricScalarFieldEnum = (typeof SearchQueryMetricScalarFieldEnum)[keyof typeof SearchQueryMetricScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references 
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'Bytes'
   */
  export type BytesFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Bytes'>
    


  /**
   * Reference to a field of type 'Bytes[]'
   */
  export type ListBytesFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Bytes[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type SearchSchemaMetaWhereInput = {
    AND?: SearchSchemaMetaWhereInput | SearchSchemaMetaWhereInput[]
    OR?: SearchSchemaMetaWhereInput[]
    NOT?: SearchSchemaMetaWhereInput | SearchSchemaMetaWhereInput[]
    key?: StringFilter<"SearchSchemaMeta"> | string
    value?: JsonFilter<"SearchSchemaMeta">
    updatedAt?: DateTimeFilter<"SearchSchemaMeta"> | Date | string
  }

  export type SearchSchemaMetaOrderByWithRelationInput = {
    key?: SortOrder
    value?: SortOrder
    updatedAt?: SortOrder
  }

  export type SearchSchemaMetaWhereUniqueInput = Prisma.AtLeast<{
    key?: string
    AND?: SearchSchemaMetaWhereInput | SearchSchemaMetaWhereInput[]
    OR?: SearchSchemaMetaWhereInput[]
    NOT?: SearchSchemaMetaWhereInput | SearchSchemaMetaWhereInput[]
    value?: JsonFilter<"SearchSchemaMeta">
    updatedAt?: DateTimeFilter<"SearchSchemaMeta"> | Date | string
  }, "key">

  export type SearchSchemaMetaOrderByWithAggregationInput = {
    key?: SortOrder
    value?: SortOrder
    updatedAt?: SortOrder
    _count?: SearchSchemaMetaCountOrderByAggregateInput
    _max?: SearchSchemaMetaMaxOrderByAggregateInput
    _min?: SearchSchemaMetaMinOrderByAggregateInput
  }

  export type SearchSchemaMetaScalarWhereWithAggregatesInput = {
    AND?: SearchSchemaMetaScalarWhereWithAggregatesInput | SearchSchemaMetaScalarWhereWithAggregatesInput[]
    OR?: SearchSchemaMetaScalarWhereWithAggregatesInput[]
    NOT?: SearchSchemaMetaScalarWhereWithAggregatesInput | SearchSchemaMetaScalarWhereWithAggregatesInput[]
    key?: StringWithAggregatesFilter<"SearchSchemaMeta"> | string
    value?: JsonWithAggregatesFilter<"SearchSchemaMeta">
    updatedAt?: DateTimeWithAggregatesFilter<"SearchSchemaMeta"> | Date | string
  }

  export type SearchModelVersionWhereInput = {
    AND?: SearchModelVersionWhereInput | SearchModelVersionWhereInput[]
    OR?: SearchModelVersionWhereInput[]
    NOT?: SearchModelVersionWhereInput | SearchModelVersionWhereInput[]
    id?: UuidFilter<"SearchModelVersion"> | string
    provider?: StringFilter<"SearchModelVersion"> | string
    model?: StringFilter<"SearchModelVersion"> | string
    revision?: StringFilter<"SearchModelVersion"> | string
    dimension?: IntFilter<"SearchModelVersion"> | number
    sourceSha256?: StringFilter<"SearchModelVersion"> | string
    packageFreezeSha256?: StringFilter<"SearchModelVersion"> | string
    modelManifestSha256?: StringFilter<"SearchModelVersion"> | string
    status?: StringFilter<"SearchModelVersion"> | string
    createdAt?: DateTimeFilter<"SearchModelVersion"> | Date | string
    retiredAt?: DateTimeNullableFilter<"SearchModelVersion"> | Date | string | null
    embeddings?: SearchEmbeddingListRelationFilter
    indexTasks?: SearchIndexTaskListRelationFilter
  }

  export type SearchModelVersionOrderByWithRelationInput = {
    id?: SortOrder
    provider?: SortOrder
    model?: SortOrder
    revision?: SortOrder
    dimension?: SortOrder
    sourceSha256?: SortOrder
    packageFreezeSha256?: SortOrder
    modelManifestSha256?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    retiredAt?: SortOrderInput | SortOrder
    embeddings?: SearchEmbeddingOrderByRelationAggregateInput
    indexTasks?: SearchIndexTaskOrderByRelationAggregateInput
  }

  export type SearchModelVersionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    provider_model_revision?: SearchModelVersionProviderModelRevisionCompoundUniqueInput
    AND?: SearchModelVersionWhereInput | SearchModelVersionWhereInput[]
    OR?: SearchModelVersionWhereInput[]
    NOT?: SearchModelVersionWhereInput | SearchModelVersionWhereInput[]
    provider?: StringFilter<"SearchModelVersion"> | string
    model?: StringFilter<"SearchModelVersion"> | string
    revision?: StringFilter<"SearchModelVersion"> | string
    dimension?: IntFilter<"SearchModelVersion"> | number
    sourceSha256?: StringFilter<"SearchModelVersion"> | string
    packageFreezeSha256?: StringFilter<"SearchModelVersion"> | string
    modelManifestSha256?: StringFilter<"SearchModelVersion"> | string
    status?: StringFilter<"SearchModelVersion"> | string
    createdAt?: DateTimeFilter<"SearchModelVersion"> | Date | string
    retiredAt?: DateTimeNullableFilter<"SearchModelVersion"> | Date | string | null
    embeddings?: SearchEmbeddingListRelationFilter
    indexTasks?: SearchIndexTaskListRelationFilter
  }, "id" | "provider_model_revision">

  export type SearchModelVersionOrderByWithAggregationInput = {
    id?: SortOrder
    provider?: SortOrder
    model?: SortOrder
    revision?: SortOrder
    dimension?: SortOrder
    sourceSha256?: SortOrder
    packageFreezeSha256?: SortOrder
    modelManifestSha256?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    retiredAt?: SortOrderInput | SortOrder
    _count?: SearchModelVersionCountOrderByAggregateInput
    _avg?: SearchModelVersionAvgOrderByAggregateInput
    _max?: SearchModelVersionMaxOrderByAggregateInput
    _min?: SearchModelVersionMinOrderByAggregateInput
    _sum?: SearchModelVersionSumOrderByAggregateInput
  }

  export type SearchModelVersionScalarWhereWithAggregatesInput = {
    AND?: SearchModelVersionScalarWhereWithAggregatesInput | SearchModelVersionScalarWhereWithAggregatesInput[]
    OR?: SearchModelVersionScalarWhereWithAggregatesInput[]
    NOT?: SearchModelVersionScalarWhereWithAggregatesInput | SearchModelVersionScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SearchModelVersion"> | string
    provider?: StringWithAggregatesFilter<"SearchModelVersion"> | string
    model?: StringWithAggregatesFilter<"SearchModelVersion"> | string
    revision?: StringWithAggregatesFilter<"SearchModelVersion"> | string
    dimension?: IntWithAggregatesFilter<"SearchModelVersion"> | number
    sourceSha256?: StringWithAggregatesFilter<"SearchModelVersion"> | string
    packageFreezeSha256?: StringWithAggregatesFilter<"SearchModelVersion"> | string
    modelManifestSha256?: StringWithAggregatesFilter<"SearchModelVersion"> | string
    status?: StringWithAggregatesFilter<"SearchModelVersion"> | string
    createdAt?: DateTimeWithAggregatesFilter<"SearchModelVersion"> | Date | string
    retiredAt?: DateTimeNullableWithAggregatesFilter<"SearchModelVersion"> | Date | string | null
  }

  export type SearchChunkWhereInput = {
    AND?: SearchChunkWhereInput | SearchChunkWhereInput[]
    OR?: SearchChunkWhereInput[]
    NOT?: SearchChunkWhereInput | SearchChunkWhereInput[]
    id?: StringFilter<"SearchChunk"> | string
    workspaceId?: UuidFilter<"SearchChunk"> | string
    researchObjectId?: UuidFilter<"SearchChunk"> | string
    artifactId?: UuidFilter<"SearchChunk"> | string
    sourceVersionId?: UuidNullableFilter<"SearchChunk"> | string | null
    sourceVersionNo?: IntNullableFilter<"SearchChunk"> | number | null
    indexTaskId?: UuidNullableFilter<"SearchChunk"> | string | null
    contentHash?: StringFilter<"SearchChunk"> | string
    ordinal?: IntFilter<"SearchChunk"> | number
    language?: StringFilter<"SearchChunk"> | string
    text?: StringFilter<"SearchChunk"> | string
    tokenCount?: IntFilter<"SearchChunk"> | number
    locators?: JsonFilter<"SearchChunk">
    claimIds?: JsonFilter<"SearchChunk">
    lexicalTerms?: JsonFilter<"SearchChunk">
    termFrequencies?: JsonFilter<"SearchChunk">
    lexicalText?: StringFilter<"SearchChunk"> | string
    active?: BoolFilter<"SearchChunk"> | boolean
    createdAt?: DateTimeFilter<"SearchChunk"> | Date | string
    updatedAt?: DateTimeFilter<"SearchChunk"> | Date | string
    embeddings?: SearchEmbeddingListRelationFilter
    indexTask?: XOR<SearchIndexTaskNullableRelationFilter, SearchIndexTaskWhereInput> | null
  }

  export type SearchChunkOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    researchObjectId?: SortOrder
    artifactId?: SortOrder
    sourceVersionId?: SortOrderInput | SortOrder
    sourceVersionNo?: SortOrderInput | SortOrder
    indexTaskId?: SortOrderInput | SortOrder
    contentHash?: SortOrder
    ordinal?: SortOrder
    language?: SortOrder
    text?: SortOrder
    tokenCount?: SortOrder
    locators?: SortOrder
    claimIds?: SortOrder
    lexicalTerms?: SortOrder
    termFrequencies?: SortOrder
    lexicalText?: SortOrder
    active?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    embeddings?: SearchEmbeddingOrderByRelationAggregateInput
    indexTask?: SearchIndexTaskOrderByWithRelationInput
  }

  export type SearchChunkWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    workspaceId_id?: SearchChunkWorkspaceIdIdCompoundUniqueInput
    workspaceId_indexTaskId_ordinal?: SearchChunkWorkspaceIdIndexTaskIdOrdinalCompoundUniqueInput
    AND?: SearchChunkWhereInput | SearchChunkWhereInput[]
    OR?: SearchChunkWhereInput[]
    NOT?: SearchChunkWhereInput | SearchChunkWhereInput[]
    workspaceId?: UuidFilter<"SearchChunk"> | string
    researchObjectId?: UuidFilter<"SearchChunk"> | string
    artifactId?: UuidFilter<"SearchChunk"> | string
    sourceVersionId?: UuidNullableFilter<"SearchChunk"> | string | null
    sourceVersionNo?: IntNullableFilter<"SearchChunk"> | number | null
    indexTaskId?: UuidNullableFilter<"SearchChunk"> | string | null
    contentHash?: StringFilter<"SearchChunk"> | string
    ordinal?: IntFilter<"SearchChunk"> | number
    language?: StringFilter<"SearchChunk"> | string
    text?: StringFilter<"SearchChunk"> | string
    tokenCount?: IntFilter<"SearchChunk"> | number
    locators?: JsonFilter<"SearchChunk">
    claimIds?: JsonFilter<"SearchChunk">
    lexicalTerms?: JsonFilter<"SearchChunk">
    termFrequencies?: JsonFilter<"SearchChunk">
    lexicalText?: StringFilter<"SearchChunk"> | string
    active?: BoolFilter<"SearchChunk"> | boolean
    createdAt?: DateTimeFilter<"SearchChunk"> | Date | string
    updatedAt?: DateTimeFilter<"SearchChunk"> | Date | string
    embeddings?: SearchEmbeddingListRelationFilter
    indexTask?: XOR<SearchIndexTaskNullableRelationFilter, SearchIndexTaskWhereInput> | null
  }, "id" | "workspaceId_id" | "workspaceId_indexTaskId_ordinal">

  export type SearchChunkOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    researchObjectId?: SortOrder
    artifactId?: SortOrder
    sourceVersionId?: SortOrderInput | SortOrder
    sourceVersionNo?: SortOrderInput | SortOrder
    indexTaskId?: SortOrderInput | SortOrder
    contentHash?: SortOrder
    ordinal?: SortOrder
    language?: SortOrder
    text?: SortOrder
    tokenCount?: SortOrder
    locators?: SortOrder
    claimIds?: SortOrder
    lexicalTerms?: SortOrder
    termFrequencies?: SortOrder
    lexicalText?: SortOrder
    active?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: SearchChunkCountOrderByAggregateInput
    _avg?: SearchChunkAvgOrderByAggregateInput
    _max?: SearchChunkMaxOrderByAggregateInput
    _min?: SearchChunkMinOrderByAggregateInput
    _sum?: SearchChunkSumOrderByAggregateInput
  }

  export type SearchChunkScalarWhereWithAggregatesInput = {
    AND?: SearchChunkScalarWhereWithAggregatesInput | SearchChunkScalarWhereWithAggregatesInput[]
    OR?: SearchChunkScalarWhereWithAggregatesInput[]
    NOT?: SearchChunkScalarWhereWithAggregatesInput | SearchChunkScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"SearchChunk"> | string
    workspaceId?: UuidWithAggregatesFilter<"SearchChunk"> | string
    researchObjectId?: UuidWithAggregatesFilter<"SearchChunk"> | string
    artifactId?: UuidWithAggregatesFilter<"SearchChunk"> | string
    sourceVersionId?: UuidNullableWithAggregatesFilter<"SearchChunk"> | string | null
    sourceVersionNo?: IntNullableWithAggregatesFilter<"SearchChunk"> | number | null
    indexTaskId?: UuidNullableWithAggregatesFilter<"SearchChunk"> | string | null
    contentHash?: StringWithAggregatesFilter<"SearchChunk"> | string
    ordinal?: IntWithAggregatesFilter<"SearchChunk"> | number
    language?: StringWithAggregatesFilter<"SearchChunk"> | string
    text?: StringWithAggregatesFilter<"SearchChunk"> | string
    tokenCount?: IntWithAggregatesFilter<"SearchChunk"> | number
    locators?: JsonWithAggregatesFilter<"SearchChunk">
    claimIds?: JsonWithAggregatesFilter<"SearchChunk">
    lexicalTerms?: JsonWithAggregatesFilter<"SearchChunk">
    termFrequencies?: JsonWithAggregatesFilter<"SearchChunk">
    lexicalText?: StringWithAggregatesFilter<"SearchChunk"> | string
    active?: BoolWithAggregatesFilter<"SearchChunk"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"SearchChunk"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"SearchChunk"> | Date | string
  }

  export type SearchEmbeddingWhereInput = {
    AND?: SearchEmbeddingWhereInput | SearchEmbeddingWhereInput[]
    OR?: SearchEmbeddingWhereInput[]
    NOT?: SearchEmbeddingWhereInput | SearchEmbeddingWhereInput[]
    id?: UuidFilter<"SearchEmbedding"> | string
    workspaceId?: UuidFilter<"SearchEmbedding"> | string
    chunkId?: StringFilter<"SearchEmbedding"> | string
    modelVersionId?: UuidFilter<"SearchEmbedding"> | string
    dimension?: IntFilter<"SearchEmbedding"> | number
    vector?: BytesFilter<"SearchEmbedding"> | Buffer
    vectorSha256?: StringFilter<"SearchEmbedding"> | string
    norm?: FloatFilter<"SearchEmbedding"> | number
    createdAt?: DateTimeFilter<"SearchEmbedding"> | Date | string
    chunk?: XOR<SearchChunkRelationFilter, SearchChunkWhereInput>
    modelVersion?: XOR<SearchModelVersionRelationFilter, SearchModelVersionWhereInput>
  }

  export type SearchEmbeddingOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    chunkId?: SortOrder
    modelVersionId?: SortOrder
    dimension?: SortOrder
    vector?: SortOrder
    vectorSha256?: SortOrder
    norm?: SortOrder
    createdAt?: SortOrder
    chunk?: SearchChunkOrderByWithRelationInput
    modelVersion?: SearchModelVersionOrderByWithRelationInput
  }

  export type SearchEmbeddingWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    workspaceId_chunkId_modelVersionId?: SearchEmbeddingWorkspaceIdChunkIdModelVersionIdCompoundUniqueInput
    AND?: SearchEmbeddingWhereInput | SearchEmbeddingWhereInput[]
    OR?: SearchEmbeddingWhereInput[]
    NOT?: SearchEmbeddingWhereInput | SearchEmbeddingWhereInput[]
    workspaceId?: UuidFilter<"SearchEmbedding"> | string
    chunkId?: StringFilter<"SearchEmbedding"> | string
    modelVersionId?: UuidFilter<"SearchEmbedding"> | string
    dimension?: IntFilter<"SearchEmbedding"> | number
    vector?: BytesFilter<"SearchEmbedding"> | Buffer
    vectorSha256?: StringFilter<"SearchEmbedding"> | string
    norm?: FloatFilter<"SearchEmbedding"> | number
    createdAt?: DateTimeFilter<"SearchEmbedding"> | Date | string
    chunk?: XOR<SearchChunkRelationFilter, SearchChunkWhereInput>
    modelVersion?: XOR<SearchModelVersionRelationFilter, SearchModelVersionWhereInput>
  }, "id" | "workspaceId_chunkId_modelVersionId">

  export type SearchEmbeddingOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    chunkId?: SortOrder
    modelVersionId?: SortOrder
    dimension?: SortOrder
    vector?: SortOrder
    vectorSha256?: SortOrder
    norm?: SortOrder
    createdAt?: SortOrder
    _count?: SearchEmbeddingCountOrderByAggregateInput
    _avg?: SearchEmbeddingAvgOrderByAggregateInput
    _max?: SearchEmbeddingMaxOrderByAggregateInput
    _min?: SearchEmbeddingMinOrderByAggregateInput
    _sum?: SearchEmbeddingSumOrderByAggregateInput
  }

  export type SearchEmbeddingScalarWhereWithAggregatesInput = {
    AND?: SearchEmbeddingScalarWhereWithAggregatesInput | SearchEmbeddingScalarWhereWithAggregatesInput[]
    OR?: SearchEmbeddingScalarWhereWithAggregatesInput[]
    NOT?: SearchEmbeddingScalarWhereWithAggregatesInput | SearchEmbeddingScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SearchEmbedding"> | string
    workspaceId?: UuidWithAggregatesFilter<"SearchEmbedding"> | string
    chunkId?: StringWithAggregatesFilter<"SearchEmbedding"> | string
    modelVersionId?: UuidWithAggregatesFilter<"SearchEmbedding"> | string
    dimension?: IntWithAggregatesFilter<"SearchEmbedding"> | number
    vector?: BytesWithAggregatesFilter<"SearchEmbedding"> | Buffer
    vectorSha256?: StringWithAggregatesFilter<"SearchEmbedding"> | string
    norm?: FloatWithAggregatesFilter<"SearchEmbedding"> | number
    createdAt?: DateTimeWithAggregatesFilter<"SearchEmbedding"> | Date | string
  }

  export type SearchIndexTaskWhereInput = {
    AND?: SearchIndexTaskWhereInput | SearchIndexTaskWhereInput[]
    OR?: SearchIndexTaskWhereInput[]
    NOT?: SearchIndexTaskWhereInput | SearchIndexTaskWhereInput[]
    id?: UuidFilter<"SearchIndexTask"> | string
    workspaceId?: UuidFilter<"SearchIndexTask"> | string
    researchObjectId?: UuidFilter<"SearchIndexTask"> | string
    artifactId?: UuidFilter<"SearchIndexTask"> | string
    sourceVersionId?: UuidFilter<"SearchIndexTask"> | string
    sourceVersionNo?: IntFilter<"SearchIndexTask"> | number
    contentHash?: StringFilter<"SearchIndexTask"> | string
    modelVersionId?: UuidFilter<"SearchIndexTask"> | string
    sourceGenerationSha256?: StringFilter<"SearchIndexTask"> | string
    sourceCreatedAt?: DateTimeFilter<"SearchIndexTask"> | Date | string
    status?: StringFilter<"SearchIndexTask"> | string
    attemptCount?: IntFilter<"SearchIndexTask"> | number
    errorCode?: StringNullableFilter<"SearchIndexTask"> | string | null
    leaseToken?: StringNullableFilter<"SearchIndexTask"> | string | null
    fenceOwnerTaskId?: UuidNullableFilter<"SearchIndexTask"> | string | null
    fenceOwnerCreatedAt?: DateTimeNullableFilter<"SearchIndexTask"> | Date | string | null
    fenceOwnerAttempt?: IntNullableFilter<"SearchIndexTask"> | number | null
    leaseExpiresAt?: DateTimeNullableFilter<"SearchIndexTask"> | Date | string | null
    isCurrent?: BoolFilter<"SearchIndexTask"> | boolean
    createdAt?: DateTimeFilter<"SearchIndexTask"> | Date | string
    startedAt?: DateTimeNullableFilter<"SearchIndexTask"> | Date | string | null
    finishedAt?: DateTimeNullableFilter<"SearchIndexTask"> | Date | string | null
    modelVersion?: XOR<SearchModelVersionRelationFilter, SearchModelVersionWhereInput>
    chunks?: SearchChunkListRelationFilter
  }

  export type SearchIndexTaskOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    researchObjectId?: SortOrder
    artifactId?: SortOrder
    sourceVersionId?: SortOrder
    sourceVersionNo?: SortOrder
    contentHash?: SortOrder
    modelVersionId?: SortOrder
    sourceGenerationSha256?: SortOrder
    sourceCreatedAt?: SortOrder
    status?: SortOrder
    attemptCount?: SortOrder
    errorCode?: SortOrderInput | SortOrder
    leaseToken?: SortOrderInput | SortOrder
    fenceOwnerTaskId?: SortOrderInput | SortOrder
    fenceOwnerCreatedAt?: SortOrderInput | SortOrder
    fenceOwnerAttempt?: SortOrderInput | SortOrder
    leaseExpiresAt?: SortOrderInput | SortOrder
    isCurrent?: SortOrder
    createdAt?: SortOrder
    startedAt?: SortOrderInput | SortOrder
    finishedAt?: SortOrderInput | SortOrder
    modelVersion?: SearchModelVersionOrderByWithRelationInput
    chunks?: SearchChunkOrderByRelationAggregateInput
  }

  export type SearchIndexTaskWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    workspaceId_researchObjectId_artifactId_sourceVersionId_contentHash_modelVersionId_sourceGenerationSha256?: SearchIndexTaskWorkspaceIdResearchObjectIdArtifactIdSourceVersionIdContentHashModelVersionIdSourceGenerationSha256CompoundUniqueInput
    AND?: SearchIndexTaskWhereInput | SearchIndexTaskWhereInput[]
    OR?: SearchIndexTaskWhereInput[]
    NOT?: SearchIndexTaskWhereInput | SearchIndexTaskWhereInput[]
    workspaceId?: UuidFilter<"SearchIndexTask"> | string
    researchObjectId?: UuidFilter<"SearchIndexTask"> | string
    artifactId?: UuidFilter<"SearchIndexTask"> | string
    sourceVersionId?: UuidFilter<"SearchIndexTask"> | string
    sourceVersionNo?: IntFilter<"SearchIndexTask"> | number
    contentHash?: StringFilter<"SearchIndexTask"> | string
    modelVersionId?: UuidFilter<"SearchIndexTask"> | string
    sourceGenerationSha256?: StringFilter<"SearchIndexTask"> | string
    sourceCreatedAt?: DateTimeFilter<"SearchIndexTask"> | Date | string
    status?: StringFilter<"SearchIndexTask"> | string
    attemptCount?: IntFilter<"SearchIndexTask"> | number
    errorCode?: StringNullableFilter<"SearchIndexTask"> | string | null
    leaseToken?: StringNullableFilter<"SearchIndexTask"> | string | null
    fenceOwnerTaskId?: UuidNullableFilter<"SearchIndexTask"> | string | null
    fenceOwnerCreatedAt?: DateTimeNullableFilter<"SearchIndexTask"> | Date | string | null
    fenceOwnerAttempt?: IntNullableFilter<"SearchIndexTask"> | number | null
    leaseExpiresAt?: DateTimeNullableFilter<"SearchIndexTask"> | Date | string | null
    isCurrent?: BoolFilter<"SearchIndexTask"> | boolean
    createdAt?: DateTimeFilter<"SearchIndexTask"> | Date | string
    startedAt?: DateTimeNullableFilter<"SearchIndexTask"> | Date | string | null
    finishedAt?: DateTimeNullableFilter<"SearchIndexTask"> | Date | string | null
    modelVersion?: XOR<SearchModelVersionRelationFilter, SearchModelVersionWhereInput>
    chunks?: SearchChunkListRelationFilter
  }, "id" | "workspaceId_researchObjectId_artifactId_sourceVersionId_contentHash_modelVersionId_sourceGenerationSha256">

  export type SearchIndexTaskOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    researchObjectId?: SortOrder
    artifactId?: SortOrder
    sourceVersionId?: SortOrder
    sourceVersionNo?: SortOrder
    contentHash?: SortOrder
    modelVersionId?: SortOrder
    sourceGenerationSha256?: SortOrder
    sourceCreatedAt?: SortOrder
    status?: SortOrder
    attemptCount?: SortOrder
    errorCode?: SortOrderInput | SortOrder
    leaseToken?: SortOrderInput | SortOrder
    fenceOwnerTaskId?: SortOrderInput | SortOrder
    fenceOwnerCreatedAt?: SortOrderInput | SortOrder
    fenceOwnerAttempt?: SortOrderInput | SortOrder
    leaseExpiresAt?: SortOrderInput | SortOrder
    isCurrent?: SortOrder
    createdAt?: SortOrder
    startedAt?: SortOrderInput | SortOrder
    finishedAt?: SortOrderInput | SortOrder
    _count?: SearchIndexTaskCountOrderByAggregateInput
    _avg?: SearchIndexTaskAvgOrderByAggregateInput
    _max?: SearchIndexTaskMaxOrderByAggregateInput
    _min?: SearchIndexTaskMinOrderByAggregateInput
    _sum?: SearchIndexTaskSumOrderByAggregateInput
  }

  export type SearchIndexTaskScalarWhereWithAggregatesInput = {
    AND?: SearchIndexTaskScalarWhereWithAggregatesInput | SearchIndexTaskScalarWhereWithAggregatesInput[]
    OR?: SearchIndexTaskScalarWhereWithAggregatesInput[]
    NOT?: SearchIndexTaskScalarWhereWithAggregatesInput | SearchIndexTaskScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SearchIndexTask"> | string
    workspaceId?: UuidWithAggregatesFilter<"SearchIndexTask"> | string
    researchObjectId?: UuidWithAggregatesFilter<"SearchIndexTask"> | string
    artifactId?: UuidWithAggregatesFilter<"SearchIndexTask"> | string
    sourceVersionId?: UuidWithAggregatesFilter<"SearchIndexTask"> | string
    sourceVersionNo?: IntWithAggregatesFilter<"SearchIndexTask"> | number
    contentHash?: StringWithAggregatesFilter<"SearchIndexTask"> | string
    modelVersionId?: UuidWithAggregatesFilter<"SearchIndexTask"> | string
    sourceGenerationSha256?: StringWithAggregatesFilter<"SearchIndexTask"> | string
    sourceCreatedAt?: DateTimeWithAggregatesFilter<"SearchIndexTask"> | Date | string
    status?: StringWithAggregatesFilter<"SearchIndexTask"> | string
    attemptCount?: IntWithAggregatesFilter<"SearchIndexTask"> | number
    errorCode?: StringNullableWithAggregatesFilter<"SearchIndexTask"> | string | null
    leaseToken?: StringNullableWithAggregatesFilter<"SearchIndexTask"> | string | null
    fenceOwnerTaskId?: UuidNullableWithAggregatesFilter<"SearchIndexTask"> | string | null
    fenceOwnerCreatedAt?: DateTimeNullableWithAggregatesFilter<"SearchIndexTask"> | Date | string | null
    fenceOwnerAttempt?: IntNullableWithAggregatesFilter<"SearchIndexTask"> | number | null
    leaseExpiresAt?: DateTimeNullableWithAggregatesFilter<"SearchIndexTask"> | Date | string | null
    isCurrent?: BoolWithAggregatesFilter<"SearchIndexTask"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"SearchIndexTask"> | Date | string
    startedAt?: DateTimeNullableWithAggregatesFilter<"SearchIndexTask"> | Date | string | null
    finishedAt?: DateTimeNullableWithAggregatesFilter<"SearchIndexTask"> | Date | string | null
  }

  export type SearchQueryMetricWhereInput = {
    AND?: SearchQueryMetricWhereInput | SearchQueryMetricWhereInput[]
    OR?: SearchQueryMetricWhereInput[]
    NOT?: SearchQueryMetricWhereInput | SearchQueryMetricWhereInput[]
    id?: UuidFilter<"SearchQueryMetric"> | string
    workspaceId?: UuidFilter<"SearchQueryMetric"> | string
    queryHash?: StringFilter<"SearchQueryMetric"> | string
    lexicalAvailable?: BoolFilter<"SearchQueryMetric"> | boolean
    denseAvailable?: BoolFilter<"SearchQueryMetric"> | boolean
    resultCount?: IntFilter<"SearchQueryMetric"> | number
    lexicalLatencyMs?: IntNullableFilter<"SearchQueryMetric"> | number | null
    denseLatencyMs?: IntNullableFilter<"SearchQueryMetric"> | number | null
    totalLatencyMs?: IntFilter<"SearchQueryMetric"> | number
    errorCode?: StringNullableFilter<"SearchQueryMetric"> | string | null
    createdAt?: DateTimeFilter<"SearchQueryMetric"> | Date | string
  }

  export type SearchQueryMetricOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    queryHash?: SortOrder
    lexicalAvailable?: SortOrder
    denseAvailable?: SortOrder
    resultCount?: SortOrder
    lexicalLatencyMs?: SortOrderInput | SortOrder
    denseLatencyMs?: SortOrderInput | SortOrder
    totalLatencyMs?: SortOrder
    errorCode?: SortOrderInput | SortOrder
    createdAt?: SortOrder
  }

  export type SearchQueryMetricWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: SearchQueryMetricWhereInput | SearchQueryMetricWhereInput[]
    OR?: SearchQueryMetricWhereInput[]
    NOT?: SearchQueryMetricWhereInput | SearchQueryMetricWhereInput[]
    workspaceId?: UuidFilter<"SearchQueryMetric"> | string
    queryHash?: StringFilter<"SearchQueryMetric"> | string
    lexicalAvailable?: BoolFilter<"SearchQueryMetric"> | boolean
    denseAvailable?: BoolFilter<"SearchQueryMetric"> | boolean
    resultCount?: IntFilter<"SearchQueryMetric"> | number
    lexicalLatencyMs?: IntNullableFilter<"SearchQueryMetric"> | number | null
    denseLatencyMs?: IntNullableFilter<"SearchQueryMetric"> | number | null
    totalLatencyMs?: IntFilter<"SearchQueryMetric"> | number
    errorCode?: StringNullableFilter<"SearchQueryMetric"> | string | null
    createdAt?: DateTimeFilter<"SearchQueryMetric"> | Date | string
  }, "id">

  export type SearchQueryMetricOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    queryHash?: SortOrder
    lexicalAvailable?: SortOrder
    denseAvailable?: SortOrder
    resultCount?: SortOrder
    lexicalLatencyMs?: SortOrderInput | SortOrder
    denseLatencyMs?: SortOrderInput | SortOrder
    totalLatencyMs?: SortOrder
    errorCode?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    _count?: SearchQueryMetricCountOrderByAggregateInput
    _avg?: SearchQueryMetricAvgOrderByAggregateInput
    _max?: SearchQueryMetricMaxOrderByAggregateInput
    _min?: SearchQueryMetricMinOrderByAggregateInput
    _sum?: SearchQueryMetricSumOrderByAggregateInput
  }

  export type SearchQueryMetricScalarWhereWithAggregatesInput = {
    AND?: SearchQueryMetricScalarWhereWithAggregatesInput | SearchQueryMetricScalarWhereWithAggregatesInput[]
    OR?: SearchQueryMetricScalarWhereWithAggregatesInput[]
    NOT?: SearchQueryMetricScalarWhereWithAggregatesInput | SearchQueryMetricScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SearchQueryMetric"> | string
    workspaceId?: UuidWithAggregatesFilter<"SearchQueryMetric"> | string
    queryHash?: StringWithAggregatesFilter<"SearchQueryMetric"> | string
    lexicalAvailable?: BoolWithAggregatesFilter<"SearchQueryMetric"> | boolean
    denseAvailable?: BoolWithAggregatesFilter<"SearchQueryMetric"> | boolean
    resultCount?: IntWithAggregatesFilter<"SearchQueryMetric"> | number
    lexicalLatencyMs?: IntNullableWithAggregatesFilter<"SearchQueryMetric"> | number | null
    denseLatencyMs?: IntNullableWithAggregatesFilter<"SearchQueryMetric"> | number | null
    totalLatencyMs?: IntWithAggregatesFilter<"SearchQueryMetric"> | number
    errorCode?: StringNullableWithAggregatesFilter<"SearchQueryMetric"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"SearchQueryMetric"> | Date | string
  }

  export type SearchSchemaMetaCreateInput = {
    key: string
    value: JsonNullValueInput | InputJsonValue
    updatedAt?: Date | string
  }

  export type SearchSchemaMetaUncheckedCreateInput = {
    key: string
    value: JsonNullValueInput | InputJsonValue
    updatedAt?: Date | string
  }

  export type SearchSchemaMetaUpdateInput = {
    key?: StringFieldUpdateOperationsInput | string
    value?: JsonNullValueInput | InputJsonValue
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchSchemaMetaUncheckedUpdateInput = {
    key?: StringFieldUpdateOperationsInput | string
    value?: JsonNullValueInput | InputJsonValue
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchSchemaMetaCreateManyInput = {
    key: string
    value: JsonNullValueInput | InputJsonValue
    updatedAt?: Date | string
  }

  export type SearchSchemaMetaUpdateManyMutationInput = {
    key?: StringFieldUpdateOperationsInput | string
    value?: JsonNullValueInput | InputJsonValue
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchSchemaMetaUncheckedUpdateManyInput = {
    key?: StringFieldUpdateOperationsInput | string
    value?: JsonNullValueInput | InputJsonValue
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchModelVersionCreateInput = {
    id?: string
    provider: string
    model: string
    revision: string
    dimension: number
    sourceSha256: string
    packageFreezeSha256: string
    modelManifestSha256: string
    status?: string
    createdAt?: Date | string
    retiredAt?: Date | string | null
    embeddings?: SearchEmbeddingCreateNestedManyWithoutModelVersionInput
    indexTasks?: SearchIndexTaskCreateNestedManyWithoutModelVersionInput
  }

  export type SearchModelVersionUncheckedCreateInput = {
    id?: string
    provider: string
    model: string
    revision: string
    dimension: number
    sourceSha256: string
    packageFreezeSha256: string
    modelManifestSha256: string
    status?: string
    createdAt?: Date | string
    retiredAt?: Date | string | null
    embeddings?: SearchEmbeddingUncheckedCreateNestedManyWithoutModelVersionInput
    indexTasks?: SearchIndexTaskUncheckedCreateNestedManyWithoutModelVersionInput
  }

  export type SearchModelVersionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    model?: StringFieldUpdateOperationsInput | string
    revision?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    sourceSha256?: StringFieldUpdateOperationsInput | string
    packageFreezeSha256?: StringFieldUpdateOperationsInput | string
    modelManifestSha256?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    retiredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    embeddings?: SearchEmbeddingUpdateManyWithoutModelVersionNestedInput
    indexTasks?: SearchIndexTaskUpdateManyWithoutModelVersionNestedInput
  }

  export type SearchModelVersionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    model?: StringFieldUpdateOperationsInput | string
    revision?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    sourceSha256?: StringFieldUpdateOperationsInput | string
    packageFreezeSha256?: StringFieldUpdateOperationsInput | string
    modelManifestSha256?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    retiredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    embeddings?: SearchEmbeddingUncheckedUpdateManyWithoutModelVersionNestedInput
    indexTasks?: SearchIndexTaskUncheckedUpdateManyWithoutModelVersionNestedInput
  }

  export type SearchModelVersionCreateManyInput = {
    id?: string
    provider: string
    model: string
    revision: string
    dimension: number
    sourceSha256: string
    packageFreezeSha256: string
    modelManifestSha256: string
    status?: string
    createdAt?: Date | string
    retiredAt?: Date | string | null
  }

  export type SearchModelVersionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    model?: StringFieldUpdateOperationsInput | string
    revision?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    sourceSha256?: StringFieldUpdateOperationsInput | string
    packageFreezeSha256?: StringFieldUpdateOperationsInput | string
    modelManifestSha256?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    retiredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type SearchModelVersionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    model?: StringFieldUpdateOperationsInput | string
    revision?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    sourceSha256?: StringFieldUpdateOperationsInput | string
    packageFreezeSha256?: StringFieldUpdateOperationsInput | string
    modelManifestSha256?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    retiredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type SearchChunkCreateInput = {
    id: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId?: string | null
    sourceVersionNo?: number | null
    contentHash: string
    ordinal: number
    language: string
    text: string
    tokenCount: number
    locators: JsonNullValueInput | InputJsonValue
    claimIds: JsonNullValueInput | InputJsonValue
    lexicalTerms: JsonNullValueInput | InputJsonValue
    termFrequencies: JsonNullValueInput | InputJsonValue
    lexicalText: string
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    embeddings?: SearchEmbeddingCreateNestedManyWithoutChunkInput
    indexTask?: SearchIndexTaskCreateNestedOneWithoutChunksInput
  }

  export type SearchChunkUncheckedCreateInput = {
    id: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId?: string | null
    sourceVersionNo?: number | null
    indexTaskId?: string | null
    contentHash: string
    ordinal: number
    language: string
    text: string
    tokenCount: number
    locators: JsonNullValueInput | InputJsonValue
    claimIds: JsonNullValueInput | InputJsonValue
    lexicalTerms: JsonNullValueInput | InputJsonValue
    termFrequencies: JsonNullValueInput | InputJsonValue
    lexicalText: string
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    embeddings?: SearchEmbeddingUncheckedCreateNestedManyWithoutChunkInput
  }

  export type SearchChunkUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceVersionNo?: NullableIntFieldUpdateOperationsInput | number | null
    contentHash?: StringFieldUpdateOperationsInput | string
    ordinal?: IntFieldUpdateOperationsInput | number
    language?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    tokenCount?: IntFieldUpdateOperationsInput | number
    locators?: JsonNullValueInput | InputJsonValue
    claimIds?: JsonNullValueInput | InputJsonValue
    lexicalTerms?: JsonNullValueInput | InputJsonValue
    termFrequencies?: JsonNullValueInput | InputJsonValue
    lexicalText?: StringFieldUpdateOperationsInput | string
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    embeddings?: SearchEmbeddingUpdateManyWithoutChunkNestedInput
    indexTask?: SearchIndexTaskUpdateOneWithoutChunksNestedInput
  }

  export type SearchChunkUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceVersionNo?: NullableIntFieldUpdateOperationsInput | number | null
    indexTaskId?: NullableStringFieldUpdateOperationsInput | string | null
    contentHash?: StringFieldUpdateOperationsInput | string
    ordinal?: IntFieldUpdateOperationsInput | number
    language?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    tokenCount?: IntFieldUpdateOperationsInput | number
    locators?: JsonNullValueInput | InputJsonValue
    claimIds?: JsonNullValueInput | InputJsonValue
    lexicalTerms?: JsonNullValueInput | InputJsonValue
    termFrequencies?: JsonNullValueInput | InputJsonValue
    lexicalText?: StringFieldUpdateOperationsInput | string
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    embeddings?: SearchEmbeddingUncheckedUpdateManyWithoutChunkNestedInput
  }

  export type SearchChunkCreateManyInput = {
    id: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId?: string | null
    sourceVersionNo?: number | null
    indexTaskId?: string | null
    contentHash: string
    ordinal: number
    language: string
    text: string
    tokenCount: number
    locators: JsonNullValueInput | InputJsonValue
    claimIds: JsonNullValueInput | InputJsonValue
    lexicalTerms: JsonNullValueInput | InputJsonValue
    termFrequencies: JsonNullValueInput | InputJsonValue
    lexicalText: string
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SearchChunkUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceVersionNo?: NullableIntFieldUpdateOperationsInput | number | null
    contentHash?: StringFieldUpdateOperationsInput | string
    ordinal?: IntFieldUpdateOperationsInput | number
    language?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    tokenCount?: IntFieldUpdateOperationsInput | number
    locators?: JsonNullValueInput | InputJsonValue
    claimIds?: JsonNullValueInput | InputJsonValue
    lexicalTerms?: JsonNullValueInput | InputJsonValue
    termFrequencies?: JsonNullValueInput | InputJsonValue
    lexicalText?: StringFieldUpdateOperationsInput | string
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchChunkUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceVersionNo?: NullableIntFieldUpdateOperationsInput | number | null
    indexTaskId?: NullableStringFieldUpdateOperationsInput | string | null
    contentHash?: StringFieldUpdateOperationsInput | string
    ordinal?: IntFieldUpdateOperationsInput | number
    language?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    tokenCount?: IntFieldUpdateOperationsInput | number
    locators?: JsonNullValueInput | InputJsonValue
    claimIds?: JsonNullValueInput | InputJsonValue
    lexicalTerms?: JsonNullValueInput | InputJsonValue
    termFrequencies?: JsonNullValueInput | InputJsonValue
    lexicalText?: StringFieldUpdateOperationsInput | string
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchEmbeddingCreateInput = {
    id?: string
    dimension: number
    vector: Buffer
    vectorSha256: string
    norm: number
    createdAt?: Date | string
    chunk: SearchChunkCreateNestedOneWithoutEmbeddingsInput
    modelVersion: SearchModelVersionCreateNestedOneWithoutEmbeddingsInput
  }

  export type SearchEmbeddingUncheckedCreateInput = {
    id?: string
    workspaceId: string
    chunkId: string
    modelVersionId: string
    dimension: number
    vector: Buffer
    vectorSha256: string
    norm: number
    createdAt?: Date | string
  }

  export type SearchEmbeddingUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    vector?: BytesFieldUpdateOperationsInput | Buffer
    vectorSha256?: StringFieldUpdateOperationsInput | string
    norm?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    chunk?: SearchChunkUpdateOneRequiredWithoutEmbeddingsNestedInput
    modelVersion?: SearchModelVersionUpdateOneRequiredWithoutEmbeddingsNestedInput
  }

  export type SearchEmbeddingUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    chunkId?: StringFieldUpdateOperationsInput | string
    modelVersionId?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    vector?: BytesFieldUpdateOperationsInput | Buffer
    vectorSha256?: StringFieldUpdateOperationsInput | string
    norm?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchEmbeddingCreateManyInput = {
    id?: string
    workspaceId: string
    chunkId: string
    modelVersionId: string
    dimension: number
    vector: Buffer
    vectorSha256: string
    norm: number
    createdAt?: Date | string
  }

  export type SearchEmbeddingUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    vector?: BytesFieldUpdateOperationsInput | Buffer
    vectorSha256?: StringFieldUpdateOperationsInput | string
    norm?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchEmbeddingUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    chunkId?: StringFieldUpdateOperationsInput | string
    modelVersionId?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    vector?: BytesFieldUpdateOperationsInput | Buffer
    vectorSha256?: StringFieldUpdateOperationsInput | string
    norm?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchIndexTaskCreateInput = {
    id?: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId: string
    sourceVersionNo: number
    contentHash: string
    sourceGenerationSha256: string
    sourceCreatedAt: Date | string
    status?: string
    attemptCount?: number
    errorCode?: string | null
    leaseToken?: string | null
    fenceOwnerTaskId?: string | null
    fenceOwnerCreatedAt?: Date | string | null
    fenceOwnerAttempt?: number | null
    leaseExpiresAt?: Date | string | null
    isCurrent?: boolean
    createdAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
    modelVersion: SearchModelVersionCreateNestedOneWithoutIndexTasksInput
    chunks?: SearchChunkCreateNestedManyWithoutIndexTaskInput
  }

  export type SearchIndexTaskUncheckedCreateInput = {
    id?: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId: string
    sourceVersionNo: number
    contentHash: string
    modelVersionId: string
    sourceGenerationSha256: string
    sourceCreatedAt: Date | string
    status?: string
    attemptCount?: number
    errorCode?: string | null
    leaseToken?: string | null
    fenceOwnerTaskId?: string | null
    fenceOwnerCreatedAt?: Date | string | null
    fenceOwnerAttempt?: number | null
    leaseExpiresAt?: Date | string | null
    isCurrent?: boolean
    createdAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
    chunks?: SearchChunkUncheckedCreateNestedManyWithoutIndexTaskInput
  }

  export type SearchIndexTaskUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: StringFieldUpdateOperationsInput | string
    sourceVersionNo?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    sourceGenerationSha256?: StringFieldUpdateOperationsInput | string
    sourceCreatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: StringFieldUpdateOperationsInput | string
    attemptCount?: IntFieldUpdateOperationsInput | number
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    leaseToken?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerTaskId?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerCreatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    fenceOwnerAttempt?: NullableIntFieldUpdateOperationsInput | number | null
    leaseExpiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modelVersion?: SearchModelVersionUpdateOneRequiredWithoutIndexTasksNestedInput
    chunks?: SearchChunkUpdateManyWithoutIndexTaskNestedInput
  }

  export type SearchIndexTaskUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: StringFieldUpdateOperationsInput | string
    sourceVersionNo?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    modelVersionId?: StringFieldUpdateOperationsInput | string
    sourceGenerationSha256?: StringFieldUpdateOperationsInput | string
    sourceCreatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: StringFieldUpdateOperationsInput | string
    attemptCount?: IntFieldUpdateOperationsInput | number
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    leaseToken?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerTaskId?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerCreatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    fenceOwnerAttempt?: NullableIntFieldUpdateOperationsInput | number | null
    leaseExpiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    chunks?: SearchChunkUncheckedUpdateManyWithoutIndexTaskNestedInput
  }

  export type SearchIndexTaskCreateManyInput = {
    id?: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId: string
    sourceVersionNo: number
    contentHash: string
    modelVersionId: string
    sourceGenerationSha256: string
    sourceCreatedAt: Date | string
    status?: string
    attemptCount?: number
    errorCode?: string | null
    leaseToken?: string | null
    fenceOwnerTaskId?: string | null
    fenceOwnerCreatedAt?: Date | string | null
    fenceOwnerAttempt?: number | null
    leaseExpiresAt?: Date | string | null
    isCurrent?: boolean
    createdAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
  }

  export type SearchIndexTaskUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: StringFieldUpdateOperationsInput | string
    sourceVersionNo?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    sourceGenerationSha256?: StringFieldUpdateOperationsInput | string
    sourceCreatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: StringFieldUpdateOperationsInput | string
    attemptCount?: IntFieldUpdateOperationsInput | number
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    leaseToken?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerTaskId?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerCreatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    fenceOwnerAttempt?: NullableIntFieldUpdateOperationsInput | number | null
    leaseExpiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type SearchIndexTaskUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: StringFieldUpdateOperationsInput | string
    sourceVersionNo?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    modelVersionId?: StringFieldUpdateOperationsInput | string
    sourceGenerationSha256?: StringFieldUpdateOperationsInput | string
    sourceCreatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: StringFieldUpdateOperationsInput | string
    attemptCount?: IntFieldUpdateOperationsInput | number
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    leaseToken?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerTaskId?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerCreatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    fenceOwnerAttempt?: NullableIntFieldUpdateOperationsInput | number | null
    leaseExpiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type SearchQueryMetricCreateInput = {
    id?: string
    workspaceId: string
    queryHash: string
    lexicalAvailable: boolean
    denseAvailable: boolean
    resultCount: number
    lexicalLatencyMs?: number | null
    denseLatencyMs?: number | null
    totalLatencyMs: number
    errorCode?: string | null
    createdAt?: Date | string
  }

  export type SearchQueryMetricUncheckedCreateInput = {
    id?: string
    workspaceId: string
    queryHash: string
    lexicalAvailable: boolean
    denseAvailable: boolean
    resultCount: number
    lexicalLatencyMs?: number | null
    denseLatencyMs?: number | null
    totalLatencyMs: number
    errorCode?: string | null
    createdAt?: Date | string
  }

  export type SearchQueryMetricUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    queryHash?: StringFieldUpdateOperationsInput | string
    lexicalAvailable?: BoolFieldUpdateOperationsInput | boolean
    denseAvailable?: BoolFieldUpdateOperationsInput | boolean
    resultCount?: IntFieldUpdateOperationsInput | number
    lexicalLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null
    denseLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null
    totalLatencyMs?: IntFieldUpdateOperationsInput | number
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchQueryMetricUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    queryHash?: StringFieldUpdateOperationsInput | string
    lexicalAvailable?: BoolFieldUpdateOperationsInput | boolean
    denseAvailable?: BoolFieldUpdateOperationsInput | boolean
    resultCount?: IntFieldUpdateOperationsInput | number
    lexicalLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null
    denseLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null
    totalLatencyMs?: IntFieldUpdateOperationsInput | number
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchQueryMetricCreateManyInput = {
    id?: string
    workspaceId: string
    queryHash: string
    lexicalAvailable: boolean
    denseAvailable: boolean
    resultCount: number
    lexicalLatencyMs?: number | null
    denseLatencyMs?: number | null
    totalLatencyMs: number
    errorCode?: string | null
    createdAt?: Date | string
  }

  export type SearchQueryMetricUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    queryHash?: StringFieldUpdateOperationsInput | string
    lexicalAvailable?: BoolFieldUpdateOperationsInput | boolean
    denseAvailable?: BoolFieldUpdateOperationsInput | boolean
    resultCount?: IntFieldUpdateOperationsInput | number
    lexicalLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null
    denseLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null
    totalLatencyMs?: IntFieldUpdateOperationsInput | number
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchQueryMetricUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    queryHash?: StringFieldUpdateOperationsInput | string
    lexicalAvailable?: BoolFieldUpdateOperationsInput | boolean
    denseAvailable?: BoolFieldUpdateOperationsInput | boolean
    resultCount?: IntFieldUpdateOperationsInput | number
    lexicalLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null
    denseLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null
    totalLatencyMs?: IntFieldUpdateOperationsInput | number
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }
  export type JsonFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type SearchSchemaMetaCountOrderByAggregateInput = {
    key?: SortOrder
    value?: SortOrder
    updatedAt?: SortOrder
  }

  export type SearchSchemaMetaMaxOrderByAggregateInput = {
    key?: SortOrder
    updatedAt?: SortOrder
  }

  export type SearchSchemaMetaMinOrderByAggregateInput = {
    key?: SortOrder
    updatedAt?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type UuidFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidFilter<$PrismaModel> | string
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type SearchEmbeddingListRelationFilter = {
    every?: SearchEmbeddingWhereInput
    some?: SearchEmbeddingWhereInput
    none?: SearchEmbeddingWhereInput
  }

  export type SearchIndexTaskListRelationFilter = {
    every?: SearchIndexTaskWhereInput
    some?: SearchIndexTaskWhereInput
    none?: SearchIndexTaskWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type SearchEmbeddingOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SearchIndexTaskOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SearchModelVersionProviderModelRevisionCompoundUniqueInput = {
    provider: string
    model: string
    revision: string
  }

  export type SearchModelVersionCountOrderByAggregateInput = {
    id?: SortOrder
    provider?: SortOrder
    model?: SortOrder
    revision?: SortOrder
    dimension?: SortOrder
    sourceSha256?: SortOrder
    packageFreezeSha256?: SortOrder
    modelManifestSha256?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    retiredAt?: SortOrder
  }

  export type SearchModelVersionAvgOrderByAggregateInput = {
    dimension?: SortOrder
  }

  export type SearchModelVersionMaxOrderByAggregateInput = {
    id?: SortOrder
    provider?: SortOrder
    model?: SortOrder
    revision?: SortOrder
    dimension?: SortOrder
    sourceSha256?: SortOrder
    packageFreezeSha256?: SortOrder
    modelManifestSha256?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    retiredAt?: SortOrder
  }

  export type SearchModelVersionMinOrderByAggregateInput = {
    id?: SortOrder
    provider?: SortOrder
    model?: SortOrder
    revision?: SortOrder
    dimension?: SortOrder
    sourceSha256?: SortOrder
    packageFreezeSha256?: SortOrder
    modelManifestSha256?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    retiredAt?: SortOrder
  }

  export type SearchModelVersionSumOrderByAggregateInput = {
    dimension?: SortOrder
  }

  export type UuidWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type UuidNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidNullableFilter<$PrismaModel> | string | null
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type SearchIndexTaskNullableRelationFilter = {
    is?: SearchIndexTaskWhereInput | null
    isNot?: SearchIndexTaskWhereInput | null
  }

  export type SearchChunkWorkspaceIdIdCompoundUniqueInput = {
    workspaceId: string
    id: string
  }

  export type SearchChunkWorkspaceIdIndexTaskIdOrdinalCompoundUniqueInput = {
    workspaceId: string
    indexTaskId: string
    ordinal: number
  }

  export type SearchChunkCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    researchObjectId?: SortOrder
    artifactId?: SortOrder
    sourceVersionId?: SortOrder
    sourceVersionNo?: SortOrder
    indexTaskId?: SortOrder
    contentHash?: SortOrder
    ordinal?: SortOrder
    language?: SortOrder
    text?: SortOrder
    tokenCount?: SortOrder
    locators?: SortOrder
    claimIds?: SortOrder
    lexicalTerms?: SortOrder
    termFrequencies?: SortOrder
    lexicalText?: SortOrder
    active?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SearchChunkAvgOrderByAggregateInput = {
    sourceVersionNo?: SortOrder
    ordinal?: SortOrder
    tokenCount?: SortOrder
  }

  export type SearchChunkMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    researchObjectId?: SortOrder
    artifactId?: SortOrder
    sourceVersionId?: SortOrder
    sourceVersionNo?: SortOrder
    indexTaskId?: SortOrder
    contentHash?: SortOrder
    ordinal?: SortOrder
    language?: SortOrder
    text?: SortOrder
    tokenCount?: SortOrder
    lexicalText?: SortOrder
    active?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SearchChunkMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    researchObjectId?: SortOrder
    artifactId?: SortOrder
    sourceVersionId?: SortOrder
    sourceVersionNo?: SortOrder
    indexTaskId?: SortOrder
    contentHash?: SortOrder
    ordinal?: SortOrder
    language?: SortOrder
    text?: SortOrder
    tokenCount?: SortOrder
    lexicalText?: SortOrder
    active?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SearchChunkSumOrderByAggregateInput = {
    sourceVersionNo?: SortOrder
    ordinal?: SortOrder
    tokenCount?: SortOrder
  }

  export type UuidNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type BytesFilter<$PrismaModel = never> = {
    equals?: Buffer | BytesFieldRefInput<$PrismaModel>
    in?: Buffer[] | ListBytesFieldRefInput<$PrismaModel>
    notIn?: Buffer[] | ListBytesFieldRefInput<$PrismaModel>
    not?: NestedBytesFilter<$PrismaModel> | Buffer
  }

  export type FloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type SearchChunkRelationFilter = {
    is?: SearchChunkWhereInput
    isNot?: SearchChunkWhereInput
  }

  export type SearchModelVersionRelationFilter = {
    is?: SearchModelVersionWhereInput
    isNot?: SearchModelVersionWhereInput
  }

  export type SearchEmbeddingWorkspaceIdChunkIdModelVersionIdCompoundUniqueInput = {
    workspaceId: string
    chunkId: string
    modelVersionId: string
  }

  export type SearchEmbeddingCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    chunkId?: SortOrder
    modelVersionId?: SortOrder
    dimension?: SortOrder
    vector?: SortOrder
    vectorSha256?: SortOrder
    norm?: SortOrder
    createdAt?: SortOrder
  }

  export type SearchEmbeddingAvgOrderByAggregateInput = {
    dimension?: SortOrder
    norm?: SortOrder
  }

  export type SearchEmbeddingMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    chunkId?: SortOrder
    modelVersionId?: SortOrder
    dimension?: SortOrder
    vector?: SortOrder
    vectorSha256?: SortOrder
    norm?: SortOrder
    createdAt?: SortOrder
  }

  export type SearchEmbeddingMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    chunkId?: SortOrder
    modelVersionId?: SortOrder
    dimension?: SortOrder
    vector?: SortOrder
    vectorSha256?: SortOrder
    norm?: SortOrder
    createdAt?: SortOrder
  }

  export type SearchEmbeddingSumOrderByAggregateInput = {
    dimension?: SortOrder
    norm?: SortOrder
  }

  export type BytesWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Buffer | BytesFieldRefInput<$PrismaModel>
    in?: Buffer[] | ListBytesFieldRefInput<$PrismaModel>
    notIn?: Buffer[] | ListBytesFieldRefInput<$PrismaModel>
    not?: NestedBytesWithAggregatesFilter<$PrismaModel> | Buffer
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBytesFilter<$PrismaModel>
    _max?: NestedBytesFilter<$PrismaModel>
  }

  export type FloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type SearchChunkListRelationFilter = {
    every?: SearchChunkWhereInput
    some?: SearchChunkWhereInput
    none?: SearchChunkWhereInput
  }

  export type SearchChunkOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SearchIndexTaskWorkspaceIdResearchObjectIdArtifactIdSourceVersionIdContentHashModelVersionIdSourceGenerationSha256CompoundUniqueInput = {
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId: string
    contentHash: string
    modelVersionId: string
    sourceGenerationSha256: string
  }

  export type SearchIndexTaskCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    researchObjectId?: SortOrder
    artifactId?: SortOrder
    sourceVersionId?: SortOrder
    sourceVersionNo?: SortOrder
    contentHash?: SortOrder
    modelVersionId?: SortOrder
    sourceGenerationSha256?: SortOrder
    sourceCreatedAt?: SortOrder
    status?: SortOrder
    attemptCount?: SortOrder
    errorCode?: SortOrder
    leaseToken?: SortOrder
    fenceOwnerTaskId?: SortOrder
    fenceOwnerCreatedAt?: SortOrder
    fenceOwnerAttempt?: SortOrder
    leaseExpiresAt?: SortOrder
    isCurrent?: SortOrder
    createdAt?: SortOrder
    startedAt?: SortOrder
    finishedAt?: SortOrder
  }

  export type SearchIndexTaskAvgOrderByAggregateInput = {
    sourceVersionNo?: SortOrder
    attemptCount?: SortOrder
    fenceOwnerAttempt?: SortOrder
  }

  export type SearchIndexTaskMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    researchObjectId?: SortOrder
    artifactId?: SortOrder
    sourceVersionId?: SortOrder
    sourceVersionNo?: SortOrder
    contentHash?: SortOrder
    modelVersionId?: SortOrder
    sourceGenerationSha256?: SortOrder
    sourceCreatedAt?: SortOrder
    status?: SortOrder
    attemptCount?: SortOrder
    errorCode?: SortOrder
    leaseToken?: SortOrder
    fenceOwnerTaskId?: SortOrder
    fenceOwnerCreatedAt?: SortOrder
    fenceOwnerAttempt?: SortOrder
    leaseExpiresAt?: SortOrder
    isCurrent?: SortOrder
    createdAt?: SortOrder
    startedAt?: SortOrder
    finishedAt?: SortOrder
  }

  export type SearchIndexTaskMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    researchObjectId?: SortOrder
    artifactId?: SortOrder
    sourceVersionId?: SortOrder
    sourceVersionNo?: SortOrder
    contentHash?: SortOrder
    modelVersionId?: SortOrder
    sourceGenerationSha256?: SortOrder
    sourceCreatedAt?: SortOrder
    status?: SortOrder
    attemptCount?: SortOrder
    errorCode?: SortOrder
    leaseToken?: SortOrder
    fenceOwnerTaskId?: SortOrder
    fenceOwnerCreatedAt?: SortOrder
    fenceOwnerAttempt?: SortOrder
    leaseExpiresAt?: SortOrder
    isCurrent?: SortOrder
    createdAt?: SortOrder
    startedAt?: SortOrder
    finishedAt?: SortOrder
  }

  export type SearchIndexTaskSumOrderByAggregateInput = {
    sourceVersionNo?: SortOrder
    attemptCount?: SortOrder
    fenceOwnerAttempt?: SortOrder
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type SearchQueryMetricCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    queryHash?: SortOrder
    lexicalAvailable?: SortOrder
    denseAvailable?: SortOrder
    resultCount?: SortOrder
    lexicalLatencyMs?: SortOrder
    denseLatencyMs?: SortOrder
    totalLatencyMs?: SortOrder
    errorCode?: SortOrder
    createdAt?: SortOrder
  }

  export type SearchQueryMetricAvgOrderByAggregateInput = {
    resultCount?: SortOrder
    lexicalLatencyMs?: SortOrder
    denseLatencyMs?: SortOrder
    totalLatencyMs?: SortOrder
  }

  export type SearchQueryMetricMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    queryHash?: SortOrder
    lexicalAvailable?: SortOrder
    denseAvailable?: SortOrder
    resultCount?: SortOrder
    lexicalLatencyMs?: SortOrder
    denseLatencyMs?: SortOrder
    totalLatencyMs?: SortOrder
    errorCode?: SortOrder
    createdAt?: SortOrder
  }

  export type SearchQueryMetricMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    queryHash?: SortOrder
    lexicalAvailable?: SortOrder
    denseAvailable?: SortOrder
    resultCount?: SortOrder
    lexicalLatencyMs?: SortOrder
    denseLatencyMs?: SortOrder
    totalLatencyMs?: SortOrder
    errorCode?: SortOrder
    createdAt?: SortOrder
  }

  export type SearchQueryMetricSumOrderByAggregateInput = {
    resultCount?: SortOrder
    lexicalLatencyMs?: SortOrder
    denseLatencyMs?: SortOrder
    totalLatencyMs?: SortOrder
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type SearchEmbeddingCreateNestedManyWithoutModelVersionInput = {
    create?: XOR<SearchEmbeddingCreateWithoutModelVersionInput, SearchEmbeddingUncheckedCreateWithoutModelVersionInput> | SearchEmbeddingCreateWithoutModelVersionInput[] | SearchEmbeddingUncheckedCreateWithoutModelVersionInput[]
    connectOrCreate?: SearchEmbeddingCreateOrConnectWithoutModelVersionInput | SearchEmbeddingCreateOrConnectWithoutModelVersionInput[]
    createMany?: SearchEmbeddingCreateManyModelVersionInputEnvelope
    connect?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
  }

  export type SearchIndexTaskCreateNestedManyWithoutModelVersionInput = {
    create?: XOR<SearchIndexTaskCreateWithoutModelVersionInput, SearchIndexTaskUncheckedCreateWithoutModelVersionInput> | SearchIndexTaskCreateWithoutModelVersionInput[] | SearchIndexTaskUncheckedCreateWithoutModelVersionInput[]
    connectOrCreate?: SearchIndexTaskCreateOrConnectWithoutModelVersionInput | SearchIndexTaskCreateOrConnectWithoutModelVersionInput[]
    createMany?: SearchIndexTaskCreateManyModelVersionInputEnvelope
    connect?: SearchIndexTaskWhereUniqueInput | SearchIndexTaskWhereUniqueInput[]
  }

  export type SearchEmbeddingUncheckedCreateNestedManyWithoutModelVersionInput = {
    create?: XOR<SearchEmbeddingCreateWithoutModelVersionInput, SearchEmbeddingUncheckedCreateWithoutModelVersionInput> | SearchEmbeddingCreateWithoutModelVersionInput[] | SearchEmbeddingUncheckedCreateWithoutModelVersionInput[]
    connectOrCreate?: SearchEmbeddingCreateOrConnectWithoutModelVersionInput | SearchEmbeddingCreateOrConnectWithoutModelVersionInput[]
    createMany?: SearchEmbeddingCreateManyModelVersionInputEnvelope
    connect?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
  }

  export type SearchIndexTaskUncheckedCreateNestedManyWithoutModelVersionInput = {
    create?: XOR<SearchIndexTaskCreateWithoutModelVersionInput, SearchIndexTaskUncheckedCreateWithoutModelVersionInput> | SearchIndexTaskCreateWithoutModelVersionInput[] | SearchIndexTaskUncheckedCreateWithoutModelVersionInput[]
    connectOrCreate?: SearchIndexTaskCreateOrConnectWithoutModelVersionInput | SearchIndexTaskCreateOrConnectWithoutModelVersionInput[]
    createMany?: SearchIndexTaskCreateManyModelVersionInputEnvelope
    connect?: SearchIndexTaskWhereUniqueInput | SearchIndexTaskWhereUniqueInput[]
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type SearchEmbeddingUpdateManyWithoutModelVersionNestedInput = {
    create?: XOR<SearchEmbeddingCreateWithoutModelVersionInput, SearchEmbeddingUncheckedCreateWithoutModelVersionInput> | SearchEmbeddingCreateWithoutModelVersionInput[] | SearchEmbeddingUncheckedCreateWithoutModelVersionInput[]
    connectOrCreate?: SearchEmbeddingCreateOrConnectWithoutModelVersionInput | SearchEmbeddingCreateOrConnectWithoutModelVersionInput[]
    upsert?: SearchEmbeddingUpsertWithWhereUniqueWithoutModelVersionInput | SearchEmbeddingUpsertWithWhereUniqueWithoutModelVersionInput[]
    createMany?: SearchEmbeddingCreateManyModelVersionInputEnvelope
    set?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    disconnect?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    delete?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    connect?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    update?: SearchEmbeddingUpdateWithWhereUniqueWithoutModelVersionInput | SearchEmbeddingUpdateWithWhereUniqueWithoutModelVersionInput[]
    updateMany?: SearchEmbeddingUpdateManyWithWhereWithoutModelVersionInput | SearchEmbeddingUpdateManyWithWhereWithoutModelVersionInput[]
    deleteMany?: SearchEmbeddingScalarWhereInput | SearchEmbeddingScalarWhereInput[]
  }

  export type SearchIndexTaskUpdateManyWithoutModelVersionNestedInput = {
    create?: XOR<SearchIndexTaskCreateWithoutModelVersionInput, SearchIndexTaskUncheckedCreateWithoutModelVersionInput> | SearchIndexTaskCreateWithoutModelVersionInput[] | SearchIndexTaskUncheckedCreateWithoutModelVersionInput[]
    connectOrCreate?: SearchIndexTaskCreateOrConnectWithoutModelVersionInput | SearchIndexTaskCreateOrConnectWithoutModelVersionInput[]
    upsert?: SearchIndexTaskUpsertWithWhereUniqueWithoutModelVersionInput | SearchIndexTaskUpsertWithWhereUniqueWithoutModelVersionInput[]
    createMany?: SearchIndexTaskCreateManyModelVersionInputEnvelope
    set?: SearchIndexTaskWhereUniqueInput | SearchIndexTaskWhereUniqueInput[]
    disconnect?: SearchIndexTaskWhereUniqueInput | SearchIndexTaskWhereUniqueInput[]
    delete?: SearchIndexTaskWhereUniqueInput | SearchIndexTaskWhereUniqueInput[]
    connect?: SearchIndexTaskWhereUniqueInput | SearchIndexTaskWhereUniqueInput[]
    update?: SearchIndexTaskUpdateWithWhereUniqueWithoutModelVersionInput | SearchIndexTaskUpdateWithWhereUniqueWithoutModelVersionInput[]
    updateMany?: SearchIndexTaskUpdateManyWithWhereWithoutModelVersionInput | SearchIndexTaskUpdateManyWithWhereWithoutModelVersionInput[]
    deleteMany?: SearchIndexTaskScalarWhereInput | SearchIndexTaskScalarWhereInput[]
  }

  export type SearchEmbeddingUncheckedUpdateManyWithoutModelVersionNestedInput = {
    create?: XOR<SearchEmbeddingCreateWithoutModelVersionInput, SearchEmbeddingUncheckedCreateWithoutModelVersionInput> | SearchEmbeddingCreateWithoutModelVersionInput[] | SearchEmbeddingUncheckedCreateWithoutModelVersionInput[]
    connectOrCreate?: SearchEmbeddingCreateOrConnectWithoutModelVersionInput | SearchEmbeddingCreateOrConnectWithoutModelVersionInput[]
    upsert?: SearchEmbeddingUpsertWithWhereUniqueWithoutModelVersionInput | SearchEmbeddingUpsertWithWhereUniqueWithoutModelVersionInput[]
    createMany?: SearchEmbeddingCreateManyModelVersionInputEnvelope
    set?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    disconnect?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    delete?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    connect?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    update?: SearchEmbeddingUpdateWithWhereUniqueWithoutModelVersionInput | SearchEmbeddingUpdateWithWhereUniqueWithoutModelVersionInput[]
    updateMany?: SearchEmbeddingUpdateManyWithWhereWithoutModelVersionInput | SearchEmbeddingUpdateManyWithWhereWithoutModelVersionInput[]
    deleteMany?: SearchEmbeddingScalarWhereInput | SearchEmbeddingScalarWhereInput[]
  }

  export type SearchIndexTaskUncheckedUpdateManyWithoutModelVersionNestedInput = {
    create?: XOR<SearchIndexTaskCreateWithoutModelVersionInput, SearchIndexTaskUncheckedCreateWithoutModelVersionInput> | SearchIndexTaskCreateWithoutModelVersionInput[] | SearchIndexTaskUncheckedCreateWithoutModelVersionInput[]
    connectOrCreate?: SearchIndexTaskCreateOrConnectWithoutModelVersionInput | SearchIndexTaskCreateOrConnectWithoutModelVersionInput[]
    upsert?: SearchIndexTaskUpsertWithWhereUniqueWithoutModelVersionInput | SearchIndexTaskUpsertWithWhereUniqueWithoutModelVersionInput[]
    createMany?: SearchIndexTaskCreateManyModelVersionInputEnvelope
    set?: SearchIndexTaskWhereUniqueInput | SearchIndexTaskWhereUniqueInput[]
    disconnect?: SearchIndexTaskWhereUniqueInput | SearchIndexTaskWhereUniqueInput[]
    delete?: SearchIndexTaskWhereUniqueInput | SearchIndexTaskWhereUniqueInput[]
    connect?: SearchIndexTaskWhereUniqueInput | SearchIndexTaskWhereUniqueInput[]
    update?: SearchIndexTaskUpdateWithWhereUniqueWithoutModelVersionInput | SearchIndexTaskUpdateWithWhereUniqueWithoutModelVersionInput[]
    updateMany?: SearchIndexTaskUpdateManyWithWhereWithoutModelVersionInput | SearchIndexTaskUpdateManyWithWhereWithoutModelVersionInput[]
    deleteMany?: SearchIndexTaskScalarWhereInput | SearchIndexTaskScalarWhereInput[]
  }

  export type SearchEmbeddingCreateNestedManyWithoutChunkInput = {
    create?: XOR<SearchEmbeddingCreateWithoutChunkInput, SearchEmbeddingUncheckedCreateWithoutChunkInput> | SearchEmbeddingCreateWithoutChunkInput[] | SearchEmbeddingUncheckedCreateWithoutChunkInput[]
    connectOrCreate?: SearchEmbeddingCreateOrConnectWithoutChunkInput | SearchEmbeddingCreateOrConnectWithoutChunkInput[]
    createMany?: SearchEmbeddingCreateManyChunkInputEnvelope
    connect?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
  }

  export type SearchIndexTaskCreateNestedOneWithoutChunksInput = {
    create?: XOR<SearchIndexTaskCreateWithoutChunksInput, SearchIndexTaskUncheckedCreateWithoutChunksInput>
    connectOrCreate?: SearchIndexTaskCreateOrConnectWithoutChunksInput
    connect?: SearchIndexTaskWhereUniqueInput
  }

  export type SearchEmbeddingUncheckedCreateNestedManyWithoutChunkInput = {
    create?: XOR<SearchEmbeddingCreateWithoutChunkInput, SearchEmbeddingUncheckedCreateWithoutChunkInput> | SearchEmbeddingCreateWithoutChunkInput[] | SearchEmbeddingUncheckedCreateWithoutChunkInput[]
    connectOrCreate?: SearchEmbeddingCreateOrConnectWithoutChunkInput | SearchEmbeddingCreateOrConnectWithoutChunkInput[]
    createMany?: SearchEmbeddingCreateManyChunkInputEnvelope
    connect?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type SearchEmbeddingUpdateManyWithoutChunkNestedInput = {
    create?: XOR<SearchEmbeddingCreateWithoutChunkInput, SearchEmbeddingUncheckedCreateWithoutChunkInput> | SearchEmbeddingCreateWithoutChunkInput[] | SearchEmbeddingUncheckedCreateWithoutChunkInput[]
    connectOrCreate?: SearchEmbeddingCreateOrConnectWithoutChunkInput | SearchEmbeddingCreateOrConnectWithoutChunkInput[]
    upsert?: SearchEmbeddingUpsertWithWhereUniqueWithoutChunkInput | SearchEmbeddingUpsertWithWhereUniqueWithoutChunkInput[]
    createMany?: SearchEmbeddingCreateManyChunkInputEnvelope
    set?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    disconnect?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    delete?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    connect?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    update?: SearchEmbeddingUpdateWithWhereUniqueWithoutChunkInput | SearchEmbeddingUpdateWithWhereUniqueWithoutChunkInput[]
    updateMany?: SearchEmbeddingUpdateManyWithWhereWithoutChunkInput | SearchEmbeddingUpdateManyWithWhereWithoutChunkInput[]
    deleteMany?: SearchEmbeddingScalarWhereInput | SearchEmbeddingScalarWhereInput[]
  }

  export type SearchIndexTaskUpdateOneWithoutChunksNestedInput = {
    create?: XOR<SearchIndexTaskCreateWithoutChunksInput, SearchIndexTaskUncheckedCreateWithoutChunksInput>
    connectOrCreate?: SearchIndexTaskCreateOrConnectWithoutChunksInput
    upsert?: SearchIndexTaskUpsertWithoutChunksInput
    disconnect?: SearchIndexTaskWhereInput | boolean
    delete?: SearchIndexTaskWhereInput | boolean
    connect?: SearchIndexTaskWhereUniqueInput
    update?: XOR<XOR<SearchIndexTaskUpdateToOneWithWhereWithoutChunksInput, SearchIndexTaskUpdateWithoutChunksInput>, SearchIndexTaskUncheckedUpdateWithoutChunksInput>
  }

  export type SearchEmbeddingUncheckedUpdateManyWithoutChunkNestedInput = {
    create?: XOR<SearchEmbeddingCreateWithoutChunkInput, SearchEmbeddingUncheckedCreateWithoutChunkInput> | SearchEmbeddingCreateWithoutChunkInput[] | SearchEmbeddingUncheckedCreateWithoutChunkInput[]
    connectOrCreate?: SearchEmbeddingCreateOrConnectWithoutChunkInput | SearchEmbeddingCreateOrConnectWithoutChunkInput[]
    upsert?: SearchEmbeddingUpsertWithWhereUniqueWithoutChunkInput | SearchEmbeddingUpsertWithWhereUniqueWithoutChunkInput[]
    createMany?: SearchEmbeddingCreateManyChunkInputEnvelope
    set?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    disconnect?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    delete?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    connect?: SearchEmbeddingWhereUniqueInput | SearchEmbeddingWhereUniqueInput[]
    update?: SearchEmbeddingUpdateWithWhereUniqueWithoutChunkInput | SearchEmbeddingUpdateWithWhereUniqueWithoutChunkInput[]
    updateMany?: SearchEmbeddingUpdateManyWithWhereWithoutChunkInput | SearchEmbeddingUpdateManyWithWhereWithoutChunkInput[]
    deleteMany?: SearchEmbeddingScalarWhereInput | SearchEmbeddingScalarWhereInput[]
  }

  export type SearchChunkCreateNestedOneWithoutEmbeddingsInput = {
    create?: XOR<SearchChunkCreateWithoutEmbeddingsInput, SearchChunkUncheckedCreateWithoutEmbeddingsInput>
    connectOrCreate?: SearchChunkCreateOrConnectWithoutEmbeddingsInput
    connect?: SearchChunkWhereUniqueInput
  }

  export type SearchModelVersionCreateNestedOneWithoutEmbeddingsInput = {
    create?: XOR<SearchModelVersionCreateWithoutEmbeddingsInput, SearchModelVersionUncheckedCreateWithoutEmbeddingsInput>
    connectOrCreate?: SearchModelVersionCreateOrConnectWithoutEmbeddingsInput
    connect?: SearchModelVersionWhereUniqueInput
  }

  export type BytesFieldUpdateOperationsInput = {
    set?: Buffer
  }

  export type FloatFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type SearchChunkUpdateOneRequiredWithoutEmbeddingsNestedInput = {
    create?: XOR<SearchChunkCreateWithoutEmbeddingsInput, SearchChunkUncheckedCreateWithoutEmbeddingsInput>
    connectOrCreate?: SearchChunkCreateOrConnectWithoutEmbeddingsInput
    upsert?: SearchChunkUpsertWithoutEmbeddingsInput
    connect?: SearchChunkWhereUniqueInput
    update?: XOR<XOR<SearchChunkUpdateToOneWithWhereWithoutEmbeddingsInput, SearchChunkUpdateWithoutEmbeddingsInput>, SearchChunkUncheckedUpdateWithoutEmbeddingsInput>
  }

  export type SearchModelVersionUpdateOneRequiredWithoutEmbeddingsNestedInput = {
    create?: XOR<SearchModelVersionCreateWithoutEmbeddingsInput, SearchModelVersionUncheckedCreateWithoutEmbeddingsInput>
    connectOrCreate?: SearchModelVersionCreateOrConnectWithoutEmbeddingsInput
    upsert?: SearchModelVersionUpsertWithoutEmbeddingsInput
    connect?: SearchModelVersionWhereUniqueInput
    update?: XOR<XOR<SearchModelVersionUpdateToOneWithWhereWithoutEmbeddingsInput, SearchModelVersionUpdateWithoutEmbeddingsInput>, SearchModelVersionUncheckedUpdateWithoutEmbeddingsInput>
  }

  export type SearchModelVersionCreateNestedOneWithoutIndexTasksInput = {
    create?: XOR<SearchModelVersionCreateWithoutIndexTasksInput, SearchModelVersionUncheckedCreateWithoutIndexTasksInput>
    connectOrCreate?: SearchModelVersionCreateOrConnectWithoutIndexTasksInput
    connect?: SearchModelVersionWhereUniqueInput
  }

  export type SearchChunkCreateNestedManyWithoutIndexTaskInput = {
    create?: XOR<SearchChunkCreateWithoutIndexTaskInput, SearchChunkUncheckedCreateWithoutIndexTaskInput> | SearchChunkCreateWithoutIndexTaskInput[] | SearchChunkUncheckedCreateWithoutIndexTaskInput[]
    connectOrCreate?: SearchChunkCreateOrConnectWithoutIndexTaskInput | SearchChunkCreateOrConnectWithoutIndexTaskInput[]
    createMany?: SearchChunkCreateManyIndexTaskInputEnvelope
    connect?: SearchChunkWhereUniqueInput | SearchChunkWhereUniqueInput[]
  }

  export type SearchChunkUncheckedCreateNestedManyWithoutIndexTaskInput = {
    create?: XOR<SearchChunkCreateWithoutIndexTaskInput, SearchChunkUncheckedCreateWithoutIndexTaskInput> | SearchChunkCreateWithoutIndexTaskInput[] | SearchChunkUncheckedCreateWithoutIndexTaskInput[]
    connectOrCreate?: SearchChunkCreateOrConnectWithoutIndexTaskInput | SearchChunkCreateOrConnectWithoutIndexTaskInput[]
    createMany?: SearchChunkCreateManyIndexTaskInputEnvelope
    connect?: SearchChunkWhereUniqueInput | SearchChunkWhereUniqueInput[]
  }

  export type SearchModelVersionUpdateOneRequiredWithoutIndexTasksNestedInput = {
    create?: XOR<SearchModelVersionCreateWithoutIndexTasksInput, SearchModelVersionUncheckedCreateWithoutIndexTasksInput>
    connectOrCreate?: SearchModelVersionCreateOrConnectWithoutIndexTasksInput
    upsert?: SearchModelVersionUpsertWithoutIndexTasksInput
    connect?: SearchModelVersionWhereUniqueInput
    update?: XOR<XOR<SearchModelVersionUpdateToOneWithWhereWithoutIndexTasksInput, SearchModelVersionUpdateWithoutIndexTasksInput>, SearchModelVersionUncheckedUpdateWithoutIndexTasksInput>
  }

  export type SearchChunkUpdateManyWithoutIndexTaskNestedInput = {
    create?: XOR<SearchChunkCreateWithoutIndexTaskInput, SearchChunkUncheckedCreateWithoutIndexTaskInput> | SearchChunkCreateWithoutIndexTaskInput[] | SearchChunkUncheckedCreateWithoutIndexTaskInput[]
    connectOrCreate?: SearchChunkCreateOrConnectWithoutIndexTaskInput | SearchChunkCreateOrConnectWithoutIndexTaskInput[]
    upsert?: SearchChunkUpsertWithWhereUniqueWithoutIndexTaskInput | SearchChunkUpsertWithWhereUniqueWithoutIndexTaskInput[]
    createMany?: SearchChunkCreateManyIndexTaskInputEnvelope
    set?: SearchChunkWhereUniqueInput | SearchChunkWhereUniqueInput[]
    disconnect?: SearchChunkWhereUniqueInput | SearchChunkWhereUniqueInput[]
    delete?: SearchChunkWhereUniqueInput | SearchChunkWhereUniqueInput[]
    connect?: SearchChunkWhereUniqueInput | SearchChunkWhereUniqueInput[]
    update?: SearchChunkUpdateWithWhereUniqueWithoutIndexTaskInput | SearchChunkUpdateWithWhereUniqueWithoutIndexTaskInput[]
    updateMany?: SearchChunkUpdateManyWithWhereWithoutIndexTaskInput | SearchChunkUpdateManyWithWhereWithoutIndexTaskInput[]
    deleteMany?: SearchChunkScalarWhereInput | SearchChunkScalarWhereInput[]
  }

  export type SearchChunkUncheckedUpdateManyWithoutIndexTaskNestedInput = {
    create?: XOR<SearchChunkCreateWithoutIndexTaskInput, SearchChunkUncheckedCreateWithoutIndexTaskInput> | SearchChunkCreateWithoutIndexTaskInput[] | SearchChunkUncheckedCreateWithoutIndexTaskInput[]
    connectOrCreate?: SearchChunkCreateOrConnectWithoutIndexTaskInput | SearchChunkCreateOrConnectWithoutIndexTaskInput[]
    upsert?: SearchChunkUpsertWithWhereUniqueWithoutIndexTaskInput | SearchChunkUpsertWithWhereUniqueWithoutIndexTaskInput[]
    createMany?: SearchChunkCreateManyIndexTaskInputEnvelope
    set?: SearchChunkWhereUniqueInput | SearchChunkWhereUniqueInput[]
    disconnect?: SearchChunkWhereUniqueInput | SearchChunkWhereUniqueInput[]
    delete?: SearchChunkWhereUniqueInput | SearchChunkWhereUniqueInput[]
    connect?: SearchChunkWhereUniqueInput | SearchChunkWhereUniqueInput[]
    update?: SearchChunkUpdateWithWhereUniqueWithoutIndexTaskInput | SearchChunkUpdateWithWhereUniqueWithoutIndexTaskInput[]
    updateMany?: SearchChunkUpdateManyWithWhereWithoutIndexTaskInput | SearchChunkUpdateManyWithWhereWithoutIndexTaskInput[]
    deleteMany?: SearchChunkScalarWhereInput | SearchChunkScalarWhereInput[]
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }
  export type NestedJsonFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedUuidFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidFilter<$PrismaModel> | string
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedUuidWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedUuidNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidNullableFilter<$PrismaModel> | string | null
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedUuidNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedBytesFilter<$PrismaModel = never> = {
    equals?: Buffer | BytesFieldRefInput<$PrismaModel>
    in?: Buffer[] | ListBytesFieldRefInput<$PrismaModel>
    notIn?: Buffer[] | ListBytesFieldRefInput<$PrismaModel>
    not?: NestedBytesFilter<$PrismaModel> | Buffer
  }

  export type NestedBytesWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Buffer | BytesFieldRefInput<$PrismaModel>
    in?: Buffer[] | ListBytesFieldRefInput<$PrismaModel>
    notIn?: Buffer[] | ListBytesFieldRefInput<$PrismaModel>
    not?: NestedBytesWithAggregatesFilter<$PrismaModel> | Buffer
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBytesFilter<$PrismaModel>
    _max?: NestedBytesFilter<$PrismaModel>
  }

  export type NestedFloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type SearchEmbeddingCreateWithoutModelVersionInput = {
    id?: string
    dimension: number
    vector: Buffer
    vectorSha256: string
    norm: number
    createdAt?: Date | string
    chunk: SearchChunkCreateNestedOneWithoutEmbeddingsInput
  }

  export type SearchEmbeddingUncheckedCreateWithoutModelVersionInput = {
    id?: string
    workspaceId: string
    chunkId: string
    dimension: number
    vector: Buffer
    vectorSha256: string
    norm: number
    createdAt?: Date | string
  }

  export type SearchEmbeddingCreateOrConnectWithoutModelVersionInput = {
    where: SearchEmbeddingWhereUniqueInput
    create: XOR<SearchEmbeddingCreateWithoutModelVersionInput, SearchEmbeddingUncheckedCreateWithoutModelVersionInput>
  }

  export type SearchEmbeddingCreateManyModelVersionInputEnvelope = {
    data: SearchEmbeddingCreateManyModelVersionInput | SearchEmbeddingCreateManyModelVersionInput[]
    skipDuplicates?: boolean
  }

  export type SearchIndexTaskCreateWithoutModelVersionInput = {
    id?: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId: string
    sourceVersionNo: number
    contentHash: string
    sourceGenerationSha256: string
    sourceCreatedAt: Date | string
    status?: string
    attemptCount?: number
    errorCode?: string | null
    leaseToken?: string | null
    fenceOwnerTaskId?: string | null
    fenceOwnerCreatedAt?: Date | string | null
    fenceOwnerAttempt?: number | null
    leaseExpiresAt?: Date | string | null
    isCurrent?: boolean
    createdAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
    chunks?: SearchChunkCreateNestedManyWithoutIndexTaskInput
  }

  export type SearchIndexTaskUncheckedCreateWithoutModelVersionInput = {
    id?: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId: string
    sourceVersionNo: number
    contentHash: string
    sourceGenerationSha256: string
    sourceCreatedAt: Date | string
    status?: string
    attemptCount?: number
    errorCode?: string | null
    leaseToken?: string | null
    fenceOwnerTaskId?: string | null
    fenceOwnerCreatedAt?: Date | string | null
    fenceOwnerAttempt?: number | null
    leaseExpiresAt?: Date | string | null
    isCurrent?: boolean
    createdAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
    chunks?: SearchChunkUncheckedCreateNestedManyWithoutIndexTaskInput
  }

  export type SearchIndexTaskCreateOrConnectWithoutModelVersionInput = {
    where: SearchIndexTaskWhereUniqueInput
    create: XOR<SearchIndexTaskCreateWithoutModelVersionInput, SearchIndexTaskUncheckedCreateWithoutModelVersionInput>
  }

  export type SearchIndexTaskCreateManyModelVersionInputEnvelope = {
    data: SearchIndexTaskCreateManyModelVersionInput | SearchIndexTaskCreateManyModelVersionInput[]
    skipDuplicates?: boolean
  }

  export type SearchEmbeddingUpsertWithWhereUniqueWithoutModelVersionInput = {
    where: SearchEmbeddingWhereUniqueInput
    update: XOR<SearchEmbeddingUpdateWithoutModelVersionInput, SearchEmbeddingUncheckedUpdateWithoutModelVersionInput>
    create: XOR<SearchEmbeddingCreateWithoutModelVersionInput, SearchEmbeddingUncheckedCreateWithoutModelVersionInput>
  }

  export type SearchEmbeddingUpdateWithWhereUniqueWithoutModelVersionInput = {
    where: SearchEmbeddingWhereUniqueInput
    data: XOR<SearchEmbeddingUpdateWithoutModelVersionInput, SearchEmbeddingUncheckedUpdateWithoutModelVersionInput>
  }

  export type SearchEmbeddingUpdateManyWithWhereWithoutModelVersionInput = {
    where: SearchEmbeddingScalarWhereInput
    data: XOR<SearchEmbeddingUpdateManyMutationInput, SearchEmbeddingUncheckedUpdateManyWithoutModelVersionInput>
  }

  export type SearchEmbeddingScalarWhereInput = {
    AND?: SearchEmbeddingScalarWhereInput | SearchEmbeddingScalarWhereInput[]
    OR?: SearchEmbeddingScalarWhereInput[]
    NOT?: SearchEmbeddingScalarWhereInput | SearchEmbeddingScalarWhereInput[]
    id?: UuidFilter<"SearchEmbedding"> | string
    workspaceId?: UuidFilter<"SearchEmbedding"> | string
    chunkId?: StringFilter<"SearchEmbedding"> | string
    modelVersionId?: UuidFilter<"SearchEmbedding"> | string
    dimension?: IntFilter<"SearchEmbedding"> | number
    vector?: BytesFilter<"SearchEmbedding"> | Buffer
    vectorSha256?: StringFilter<"SearchEmbedding"> | string
    norm?: FloatFilter<"SearchEmbedding"> | number
    createdAt?: DateTimeFilter<"SearchEmbedding"> | Date | string
  }

  export type SearchIndexTaskUpsertWithWhereUniqueWithoutModelVersionInput = {
    where: SearchIndexTaskWhereUniqueInput
    update: XOR<SearchIndexTaskUpdateWithoutModelVersionInput, SearchIndexTaskUncheckedUpdateWithoutModelVersionInput>
    create: XOR<SearchIndexTaskCreateWithoutModelVersionInput, SearchIndexTaskUncheckedCreateWithoutModelVersionInput>
  }

  export type SearchIndexTaskUpdateWithWhereUniqueWithoutModelVersionInput = {
    where: SearchIndexTaskWhereUniqueInput
    data: XOR<SearchIndexTaskUpdateWithoutModelVersionInput, SearchIndexTaskUncheckedUpdateWithoutModelVersionInput>
  }

  export type SearchIndexTaskUpdateManyWithWhereWithoutModelVersionInput = {
    where: SearchIndexTaskScalarWhereInput
    data: XOR<SearchIndexTaskUpdateManyMutationInput, SearchIndexTaskUncheckedUpdateManyWithoutModelVersionInput>
  }

  export type SearchIndexTaskScalarWhereInput = {
    AND?: SearchIndexTaskScalarWhereInput | SearchIndexTaskScalarWhereInput[]
    OR?: SearchIndexTaskScalarWhereInput[]
    NOT?: SearchIndexTaskScalarWhereInput | SearchIndexTaskScalarWhereInput[]
    id?: UuidFilter<"SearchIndexTask"> | string
    workspaceId?: UuidFilter<"SearchIndexTask"> | string
    researchObjectId?: UuidFilter<"SearchIndexTask"> | string
    artifactId?: UuidFilter<"SearchIndexTask"> | string
    sourceVersionId?: UuidFilter<"SearchIndexTask"> | string
    sourceVersionNo?: IntFilter<"SearchIndexTask"> | number
    contentHash?: StringFilter<"SearchIndexTask"> | string
    modelVersionId?: UuidFilter<"SearchIndexTask"> | string
    sourceGenerationSha256?: StringFilter<"SearchIndexTask"> | string
    sourceCreatedAt?: DateTimeFilter<"SearchIndexTask"> | Date | string
    status?: StringFilter<"SearchIndexTask"> | string
    attemptCount?: IntFilter<"SearchIndexTask"> | number
    errorCode?: StringNullableFilter<"SearchIndexTask"> | string | null
    leaseToken?: StringNullableFilter<"SearchIndexTask"> | string | null
    fenceOwnerTaskId?: UuidNullableFilter<"SearchIndexTask"> | string | null
    fenceOwnerCreatedAt?: DateTimeNullableFilter<"SearchIndexTask"> | Date | string | null
    fenceOwnerAttempt?: IntNullableFilter<"SearchIndexTask"> | number | null
    leaseExpiresAt?: DateTimeNullableFilter<"SearchIndexTask"> | Date | string | null
    isCurrent?: BoolFilter<"SearchIndexTask"> | boolean
    createdAt?: DateTimeFilter<"SearchIndexTask"> | Date | string
    startedAt?: DateTimeNullableFilter<"SearchIndexTask"> | Date | string | null
    finishedAt?: DateTimeNullableFilter<"SearchIndexTask"> | Date | string | null
  }

  export type SearchEmbeddingCreateWithoutChunkInput = {
    id?: string
    dimension: number
    vector: Buffer
    vectorSha256: string
    norm: number
    createdAt?: Date | string
    modelVersion: SearchModelVersionCreateNestedOneWithoutEmbeddingsInput
  }

  export type SearchEmbeddingUncheckedCreateWithoutChunkInput = {
    id?: string
    modelVersionId: string
    dimension: number
    vector: Buffer
    vectorSha256: string
    norm: number
    createdAt?: Date | string
  }

  export type SearchEmbeddingCreateOrConnectWithoutChunkInput = {
    where: SearchEmbeddingWhereUniqueInput
    create: XOR<SearchEmbeddingCreateWithoutChunkInput, SearchEmbeddingUncheckedCreateWithoutChunkInput>
  }

  export type SearchEmbeddingCreateManyChunkInputEnvelope = {
    data: SearchEmbeddingCreateManyChunkInput | SearchEmbeddingCreateManyChunkInput[]
    skipDuplicates?: boolean
  }

  export type SearchIndexTaskCreateWithoutChunksInput = {
    id?: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId: string
    sourceVersionNo: number
    contentHash: string
    sourceGenerationSha256: string
    sourceCreatedAt: Date | string
    status?: string
    attemptCount?: number
    errorCode?: string | null
    leaseToken?: string | null
    fenceOwnerTaskId?: string | null
    fenceOwnerCreatedAt?: Date | string | null
    fenceOwnerAttempt?: number | null
    leaseExpiresAt?: Date | string | null
    isCurrent?: boolean
    createdAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
    modelVersion: SearchModelVersionCreateNestedOneWithoutIndexTasksInput
  }

  export type SearchIndexTaskUncheckedCreateWithoutChunksInput = {
    id?: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId: string
    sourceVersionNo: number
    contentHash: string
    modelVersionId: string
    sourceGenerationSha256: string
    sourceCreatedAt: Date | string
    status?: string
    attemptCount?: number
    errorCode?: string | null
    leaseToken?: string | null
    fenceOwnerTaskId?: string | null
    fenceOwnerCreatedAt?: Date | string | null
    fenceOwnerAttempt?: number | null
    leaseExpiresAt?: Date | string | null
    isCurrent?: boolean
    createdAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
  }

  export type SearchIndexTaskCreateOrConnectWithoutChunksInput = {
    where: SearchIndexTaskWhereUniqueInput
    create: XOR<SearchIndexTaskCreateWithoutChunksInput, SearchIndexTaskUncheckedCreateWithoutChunksInput>
  }

  export type SearchEmbeddingUpsertWithWhereUniqueWithoutChunkInput = {
    where: SearchEmbeddingWhereUniqueInput
    update: XOR<SearchEmbeddingUpdateWithoutChunkInput, SearchEmbeddingUncheckedUpdateWithoutChunkInput>
    create: XOR<SearchEmbeddingCreateWithoutChunkInput, SearchEmbeddingUncheckedCreateWithoutChunkInput>
  }

  export type SearchEmbeddingUpdateWithWhereUniqueWithoutChunkInput = {
    where: SearchEmbeddingWhereUniqueInput
    data: XOR<SearchEmbeddingUpdateWithoutChunkInput, SearchEmbeddingUncheckedUpdateWithoutChunkInput>
  }

  export type SearchEmbeddingUpdateManyWithWhereWithoutChunkInput = {
    where: SearchEmbeddingScalarWhereInput
    data: XOR<SearchEmbeddingUpdateManyMutationInput, SearchEmbeddingUncheckedUpdateManyWithoutChunkInput>
  }

  export type SearchIndexTaskUpsertWithoutChunksInput = {
    update: XOR<SearchIndexTaskUpdateWithoutChunksInput, SearchIndexTaskUncheckedUpdateWithoutChunksInput>
    create: XOR<SearchIndexTaskCreateWithoutChunksInput, SearchIndexTaskUncheckedCreateWithoutChunksInput>
    where?: SearchIndexTaskWhereInput
  }

  export type SearchIndexTaskUpdateToOneWithWhereWithoutChunksInput = {
    where?: SearchIndexTaskWhereInput
    data: XOR<SearchIndexTaskUpdateWithoutChunksInput, SearchIndexTaskUncheckedUpdateWithoutChunksInput>
  }

  export type SearchIndexTaskUpdateWithoutChunksInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: StringFieldUpdateOperationsInput | string
    sourceVersionNo?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    sourceGenerationSha256?: StringFieldUpdateOperationsInput | string
    sourceCreatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: StringFieldUpdateOperationsInput | string
    attemptCount?: IntFieldUpdateOperationsInput | number
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    leaseToken?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerTaskId?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerCreatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    fenceOwnerAttempt?: NullableIntFieldUpdateOperationsInput | number | null
    leaseExpiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modelVersion?: SearchModelVersionUpdateOneRequiredWithoutIndexTasksNestedInput
  }

  export type SearchIndexTaskUncheckedUpdateWithoutChunksInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: StringFieldUpdateOperationsInput | string
    sourceVersionNo?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    modelVersionId?: StringFieldUpdateOperationsInput | string
    sourceGenerationSha256?: StringFieldUpdateOperationsInput | string
    sourceCreatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: StringFieldUpdateOperationsInput | string
    attemptCount?: IntFieldUpdateOperationsInput | number
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    leaseToken?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerTaskId?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerCreatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    fenceOwnerAttempt?: NullableIntFieldUpdateOperationsInput | number | null
    leaseExpiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type SearchChunkCreateWithoutEmbeddingsInput = {
    id: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId?: string | null
    sourceVersionNo?: number | null
    contentHash: string
    ordinal: number
    language: string
    text: string
    tokenCount: number
    locators: JsonNullValueInput | InputJsonValue
    claimIds: JsonNullValueInput | InputJsonValue
    lexicalTerms: JsonNullValueInput | InputJsonValue
    termFrequencies: JsonNullValueInput | InputJsonValue
    lexicalText: string
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    indexTask?: SearchIndexTaskCreateNestedOneWithoutChunksInput
  }

  export type SearchChunkUncheckedCreateWithoutEmbeddingsInput = {
    id: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId?: string | null
    sourceVersionNo?: number | null
    indexTaskId?: string | null
    contentHash: string
    ordinal: number
    language: string
    text: string
    tokenCount: number
    locators: JsonNullValueInput | InputJsonValue
    claimIds: JsonNullValueInput | InputJsonValue
    lexicalTerms: JsonNullValueInput | InputJsonValue
    termFrequencies: JsonNullValueInput | InputJsonValue
    lexicalText: string
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SearchChunkCreateOrConnectWithoutEmbeddingsInput = {
    where: SearchChunkWhereUniqueInput
    create: XOR<SearchChunkCreateWithoutEmbeddingsInput, SearchChunkUncheckedCreateWithoutEmbeddingsInput>
  }

  export type SearchModelVersionCreateWithoutEmbeddingsInput = {
    id?: string
    provider: string
    model: string
    revision: string
    dimension: number
    sourceSha256: string
    packageFreezeSha256: string
    modelManifestSha256: string
    status?: string
    createdAt?: Date | string
    retiredAt?: Date | string | null
    indexTasks?: SearchIndexTaskCreateNestedManyWithoutModelVersionInput
  }

  export type SearchModelVersionUncheckedCreateWithoutEmbeddingsInput = {
    id?: string
    provider: string
    model: string
    revision: string
    dimension: number
    sourceSha256: string
    packageFreezeSha256: string
    modelManifestSha256: string
    status?: string
    createdAt?: Date | string
    retiredAt?: Date | string | null
    indexTasks?: SearchIndexTaskUncheckedCreateNestedManyWithoutModelVersionInput
  }

  export type SearchModelVersionCreateOrConnectWithoutEmbeddingsInput = {
    where: SearchModelVersionWhereUniqueInput
    create: XOR<SearchModelVersionCreateWithoutEmbeddingsInput, SearchModelVersionUncheckedCreateWithoutEmbeddingsInput>
  }

  export type SearchChunkUpsertWithoutEmbeddingsInput = {
    update: XOR<SearchChunkUpdateWithoutEmbeddingsInput, SearchChunkUncheckedUpdateWithoutEmbeddingsInput>
    create: XOR<SearchChunkCreateWithoutEmbeddingsInput, SearchChunkUncheckedCreateWithoutEmbeddingsInput>
    where?: SearchChunkWhereInput
  }

  export type SearchChunkUpdateToOneWithWhereWithoutEmbeddingsInput = {
    where?: SearchChunkWhereInput
    data: XOR<SearchChunkUpdateWithoutEmbeddingsInput, SearchChunkUncheckedUpdateWithoutEmbeddingsInput>
  }

  export type SearchChunkUpdateWithoutEmbeddingsInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceVersionNo?: NullableIntFieldUpdateOperationsInput | number | null
    contentHash?: StringFieldUpdateOperationsInput | string
    ordinal?: IntFieldUpdateOperationsInput | number
    language?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    tokenCount?: IntFieldUpdateOperationsInput | number
    locators?: JsonNullValueInput | InputJsonValue
    claimIds?: JsonNullValueInput | InputJsonValue
    lexicalTerms?: JsonNullValueInput | InputJsonValue
    termFrequencies?: JsonNullValueInput | InputJsonValue
    lexicalText?: StringFieldUpdateOperationsInput | string
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    indexTask?: SearchIndexTaskUpdateOneWithoutChunksNestedInput
  }

  export type SearchChunkUncheckedUpdateWithoutEmbeddingsInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceVersionNo?: NullableIntFieldUpdateOperationsInput | number | null
    indexTaskId?: NullableStringFieldUpdateOperationsInput | string | null
    contentHash?: StringFieldUpdateOperationsInput | string
    ordinal?: IntFieldUpdateOperationsInput | number
    language?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    tokenCount?: IntFieldUpdateOperationsInput | number
    locators?: JsonNullValueInput | InputJsonValue
    claimIds?: JsonNullValueInput | InputJsonValue
    lexicalTerms?: JsonNullValueInput | InputJsonValue
    termFrequencies?: JsonNullValueInput | InputJsonValue
    lexicalText?: StringFieldUpdateOperationsInput | string
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchModelVersionUpsertWithoutEmbeddingsInput = {
    update: XOR<SearchModelVersionUpdateWithoutEmbeddingsInput, SearchModelVersionUncheckedUpdateWithoutEmbeddingsInput>
    create: XOR<SearchModelVersionCreateWithoutEmbeddingsInput, SearchModelVersionUncheckedCreateWithoutEmbeddingsInput>
    where?: SearchModelVersionWhereInput
  }

  export type SearchModelVersionUpdateToOneWithWhereWithoutEmbeddingsInput = {
    where?: SearchModelVersionWhereInput
    data: XOR<SearchModelVersionUpdateWithoutEmbeddingsInput, SearchModelVersionUncheckedUpdateWithoutEmbeddingsInput>
  }

  export type SearchModelVersionUpdateWithoutEmbeddingsInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    model?: StringFieldUpdateOperationsInput | string
    revision?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    sourceSha256?: StringFieldUpdateOperationsInput | string
    packageFreezeSha256?: StringFieldUpdateOperationsInput | string
    modelManifestSha256?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    retiredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    indexTasks?: SearchIndexTaskUpdateManyWithoutModelVersionNestedInput
  }

  export type SearchModelVersionUncheckedUpdateWithoutEmbeddingsInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    model?: StringFieldUpdateOperationsInput | string
    revision?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    sourceSha256?: StringFieldUpdateOperationsInput | string
    packageFreezeSha256?: StringFieldUpdateOperationsInput | string
    modelManifestSha256?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    retiredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    indexTasks?: SearchIndexTaskUncheckedUpdateManyWithoutModelVersionNestedInput
  }

  export type SearchModelVersionCreateWithoutIndexTasksInput = {
    id?: string
    provider: string
    model: string
    revision: string
    dimension: number
    sourceSha256: string
    packageFreezeSha256: string
    modelManifestSha256: string
    status?: string
    createdAt?: Date | string
    retiredAt?: Date | string | null
    embeddings?: SearchEmbeddingCreateNestedManyWithoutModelVersionInput
  }

  export type SearchModelVersionUncheckedCreateWithoutIndexTasksInput = {
    id?: string
    provider: string
    model: string
    revision: string
    dimension: number
    sourceSha256: string
    packageFreezeSha256: string
    modelManifestSha256: string
    status?: string
    createdAt?: Date | string
    retiredAt?: Date | string | null
    embeddings?: SearchEmbeddingUncheckedCreateNestedManyWithoutModelVersionInput
  }

  export type SearchModelVersionCreateOrConnectWithoutIndexTasksInput = {
    where: SearchModelVersionWhereUniqueInput
    create: XOR<SearchModelVersionCreateWithoutIndexTasksInput, SearchModelVersionUncheckedCreateWithoutIndexTasksInput>
  }

  export type SearchChunkCreateWithoutIndexTaskInput = {
    id: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId?: string | null
    sourceVersionNo?: number | null
    contentHash: string
    ordinal: number
    language: string
    text: string
    tokenCount: number
    locators: JsonNullValueInput | InputJsonValue
    claimIds: JsonNullValueInput | InputJsonValue
    lexicalTerms: JsonNullValueInput | InputJsonValue
    termFrequencies: JsonNullValueInput | InputJsonValue
    lexicalText: string
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    embeddings?: SearchEmbeddingCreateNestedManyWithoutChunkInput
  }

  export type SearchChunkUncheckedCreateWithoutIndexTaskInput = {
    id: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId?: string | null
    sourceVersionNo?: number | null
    contentHash: string
    ordinal: number
    language: string
    text: string
    tokenCount: number
    locators: JsonNullValueInput | InputJsonValue
    claimIds: JsonNullValueInput | InputJsonValue
    lexicalTerms: JsonNullValueInput | InputJsonValue
    termFrequencies: JsonNullValueInput | InputJsonValue
    lexicalText: string
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    embeddings?: SearchEmbeddingUncheckedCreateNestedManyWithoutChunkInput
  }

  export type SearchChunkCreateOrConnectWithoutIndexTaskInput = {
    where: SearchChunkWhereUniqueInput
    create: XOR<SearchChunkCreateWithoutIndexTaskInput, SearchChunkUncheckedCreateWithoutIndexTaskInput>
  }

  export type SearchChunkCreateManyIndexTaskInputEnvelope = {
    data: SearchChunkCreateManyIndexTaskInput | SearchChunkCreateManyIndexTaskInput[]
    skipDuplicates?: boolean
  }

  export type SearchModelVersionUpsertWithoutIndexTasksInput = {
    update: XOR<SearchModelVersionUpdateWithoutIndexTasksInput, SearchModelVersionUncheckedUpdateWithoutIndexTasksInput>
    create: XOR<SearchModelVersionCreateWithoutIndexTasksInput, SearchModelVersionUncheckedCreateWithoutIndexTasksInput>
    where?: SearchModelVersionWhereInput
  }

  export type SearchModelVersionUpdateToOneWithWhereWithoutIndexTasksInput = {
    where?: SearchModelVersionWhereInput
    data: XOR<SearchModelVersionUpdateWithoutIndexTasksInput, SearchModelVersionUncheckedUpdateWithoutIndexTasksInput>
  }

  export type SearchModelVersionUpdateWithoutIndexTasksInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    model?: StringFieldUpdateOperationsInput | string
    revision?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    sourceSha256?: StringFieldUpdateOperationsInput | string
    packageFreezeSha256?: StringFieldUpdateOperationsInput | string
    modelManifestSha256?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    retiredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    embeddings?: SearchEmbeddingUpdateManyWithoutModelVersionNestedInput
  }

  export type SearchModelVersionUncheckedUpdateWithoutIndexTasksInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    model?: StringFieldUpdateOperationsInput | string
    revision?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    sourceSha256?: StringFieldUpdateOperationsInput | string
    packageFreezeSha256?: StringFieldUpdateOperationsInput | string
    modelManifestSha256?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    retiredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    embeddings?: SearchEmbeddingUncheckedUpdateManyWithoutModelVersionNestedInput
  }

  export type SearchChunkUpsertWithWhereUniqueWithoutIndexTaskInput = {
    where: SearchChunkWhereUniqueInput
    update: XOR<SearchChunkUpdateWithoutIndexTaskInput, SearchChunkUncheckedUpdateWithoutIndexTaskInput>
    create: XOR<SearchChunkCreateWithoutIndexTaskInput, SearchChunkUncheckedCreateWithoutIndexTaskInput>
  }

  export type SearchChunkUpdateWithWhereUniqueWithoutIndexTaskInput = {
    where: SearchChunkWhereUniqueInput
    data: XOR<SearchChunkUpdateWithoutIndexTaskInput, SearchChunkUncheckedUpdateWithoutIndexTaskInput>
  }

  export type SearchChunkUpdateManyWithWhereWithoutIndexTaskInput = {
    where: SearchChunkScalarWhereInput
    data: XOR<SearchChunkUpdateManyMutationInput, SearchChunkUncheckedUpdateManyWithoutIndexTaskInput>
  }

  export type SearchChunkScalarWhereInput = {
    AND?: SearchChunkScalarWhereInput | SearchChunkScalarWhereInput[]
    OR?: SearchChunkScalarWhereInput[]
    NOT?: SearchChunkScalarWhereInput | SearchChunkScalarWhereInput[]
    id?: StringFilter<"SearchChunk"> | string
    workspaceId?: UuidFilter<"SearchChunk"> | string
    researchObjectId?: UuidFilter<"SearchChunk"> | string
    artifactId?: UuidFilter<"SearchChunk"> | string
    sourceVersionId?: UuidNullableFilter<"SearchChunk"> | string | null
    sourceVersionNo?: IntNullableFilter<"SearchChunk"> | number | null
    indexTaskId?: UuidNullableFilter<"SearchChunk"> | string | null
    contentHash?: StringFilter<"SearchChunk"> | string
    ordinal?: IntFilter<"SearchChunk"> | number
    language?: StringFilter<"SearchChunk"> | string
    text?: StringFilter<"SearchChunk"> | string
    tokenCount?: IntFilter<"SearchChunk"> | number
    locators?: JsonFilter<"SearchChunk">
    claimIds?: JsonFilter<"SearchChunk">
    lexicalTerms?: JsonFilter<"SearchChunk">
    termFrequencies?: JsonFilter<"SearchChunk">
    lexicalText?: StringFilter<"SearchChunk"> | string
    active?: BoolFilter<"SearchChunk"> | boolean
    createdAt?: DateTimeFilter<"SearchChunk"> | Date | string
    updatedAt?: DateTimeFilter<"SearchChunk"> | Date | string
  }

  export type SearchEmbeddingCreateManyModelVersionInput = {
    id?: string
    workspaceId: string
    chunkId: string
    dimension: number
    vector: Buffer
    vectorSha256: string
    norm: number
    createdAt?: Date | string
  }

  export type SearchIndexTaskCreateManyModelVersionInput = {
    id?: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId: string
    sourceVersionNo: number
    contentHash: string
    sourceGenerationSha256: string
    sourceCreatedAt: Date | string
    status?: string
    attemptCount?: number
    errorCode?: string | null
    leaseToken?: string | null
    fenceOwnerTaskId?: string | null
    fenceOwnerCreatedAt?: Date | string | null
    fenceOwnerAttempt?: number | null
    leaseExpiresAt?: Date | string | null
    isCurrent?: boolean
    createdAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
  }

  export type SearchEmbeddingUpdateWithoutModelVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    vector?: BytesFieldUpdateOperationsInput | Buffer
    vectorSha256?: StringFieldUpdateOperationsInput | string
    norm?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    chunk?: SearchChunkUpdateOneRequiredWithoutEmbeddingsNestedInput
  }

  export type SearchEmbeddingUncheckedUpdateWithoutModelVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    chunkId?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    vector?: BytesFieldUpdateOperationsInput | Buffer
    vectorSha256?: StringFieldUpdateOperationsInput | string
    norm?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchEmbeddingUncheckedUpdateManyWithoutModelVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    chunkId?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    vector?: BytesFieldUpdateOperationsInput | Buffer
    vectorSha256?: StringFieldUpdateOperationsInput | string
    norm?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchIndexTaskUpdateWithoutModelVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: StringFieldUpdateOperationsInput | string
    sourceVersionNo?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    sourceGenerationSha256?: StringFieldUpdateOperationsInput | string
    sourceCreatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: StringFieldUpdateOperationsInput | string
    attemptCount?: IntFieldUpdateOperationsInput | number
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    leaseToken?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerTaskId?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerCreatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    fenceOwnerAttempt?: NullableIntFieldUpdateOperationsInput | number | null
    leaseExpiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    chunks?: SearchChunkUpdateManyWithoutIndexTaskNestedInput
  }

  export type SearchIndexTaskUncheckedUpdateWithoutModelVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: StringFieldUpdateOperationsInput | string
    sourceVersionNo?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    sourceGenerationSha256?: StringFieldUpdateOperationsInput | string
    sourceCreatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: StringFieldUpdateOperationsInput | string
    attemptCount?: IntFieldUpdateOperationsInput | number
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    leaseToken?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerTaskId?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerCreatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    fenceOwnerAttempt?: NullableIntFieldUpdateOperationsInput | number | null
    leaseExpiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    chunks?: SearchChunkUncheckedUpdateManyWithoutIndexTaskNestedInput
  }

  export type SearchIndexTaskUncheckedUpdateManyWithoutModelVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: StringFieldUpdateOperationsInput | string
    sourceVersionNo?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    sourceGenerationSha256?: StringFieldUpdateOperationsInput | string
    sourceCreatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: StringFieldUpdateOperationsInput | string
    attemptCount?: IntFieldUpdateOperationsInput | number
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    leaseToken?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerTaskId?: NullableStringFieldUpdateOperationsInput | string | null
    fenceOwnerCreatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    fenceOwnerAttempt?: NullableIntFieldUpdateOperationsInput | number | null
    leaseExpiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type SearchEmbeddingCreateManyChunkInput = {
    id?: string
    modelVersionId: string
    dimension: number
    vector: Buffer
    vectorSha256: string
    norm: number
    createdAt?: Date | string
  }

  export type SearchEmbeddingUpdateWithoutChunkInput = {
    id?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    vector?: BytesFieldUpdateOperationsInput | Buffer
    vectorSha256?: StringFieldUpdateOperationsInput | string
    norm?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    modelVersion?: SearchModelVersionUpdateOneRequiredWithoutEmbeddingsNestedInput
  }

  export type SearchEmbeddingUncheckedUpdateWithoutChunkInput = {
    id?: StringFieldUpdateOperationsInput | string
    modelVersionId?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    vector?: BytesFieldUpdateOperationsInput | Buffer
    vectorSha256?: StringFieldUpdateOperationsInput | string
    norm?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchEmbeddingUncheckedUpdateManyWithoutChunkInput = {
    id?: StringFieldUpdateOperationsInput | string
    modelVersionId?: StringFieldUpdateOperationsInput | string
    dimension?: IntFieldUpdateOperationsInput | number
    vector?: BytesFieldUpdateOperationsInput | Buffer
    vectorSha256?: StringFieldUpdateOperationsInput | string
    norm?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SearchChunkCreateManyIndexTaskInput = {
    id: string
    workspaceId: string
    researchObjectId: string
    artifactId: string
    sourceVersionId?: string | null
    sourceVersionNo?: number | null
    contentHash: string
    ordinal: number
    language: string
    text: string
    tokenCount: number
    locators: JsonNullValueInput | InputJsonValue
    claimIds: JsonNullValueInput | InputJsonValue
    lexicalTerms: JsonNullValueInput | InputJsonValue
    termFrequencies: JsonNullValueInput | InputJsonValue
    lexicalText: string
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SearchChunkUpdateWithoutIndexTaskInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceVersionNo?: NullableIntFieldUpdateOperationsInput | number | null
    contentHash?: StringFieldUpdateOperationsInput | string
    ordinal?: IntFieldUpdateOperationsInput | number
    language?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    tokenCount?: IntFieldUpdateOperationsInput | number
    locators?: JsonNullValueInput | InputJsonValue
    claimIds?: JsonNullValueInput | InputJsonValue
    lexicalTerms?: JsonNullValueInput | InputJsonValue
    termFrequencies?: JsonNullValueInput | InputJsonValue
    lexicalText?: StringFieldUpdateOperationsInput | string
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    embeddings?: SearchEmbeddingUpdateManyWithoutChunkNestedInput
  }

  export type SearchChunkUncheckedUpdateWithoutIndexTaskInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceVersionNo?: NullableIntFieldUpdateOperationsInput | number | null
    contentHash?: StringFieldUpdateOperationsInput | string
    ordinal?: IntFieldUpdateOperationsInput | number
    language?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    tokenCount?: IntFieldUpdateOperationsInput | number
    locators?: JsonNullValueInput | InputJsonValue
    claimIds?: JsonNullValueInput | InputJsonValue
    lexicalTerms?: JsonNullValueInput | InputJsonValue
    termFrequencies?: JsonNullValueInput | InputJsonValue
    lexicalText?: StringFieldUpdateOperationsInput | string
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    embeddings?: SearchEmbeddingUncheckedUpdateManyWithoutChunkNestedInput
  }

  export type SearchChunkUncheckedUpdateManyWithoutIndexTaskInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    researchObjectId?: StringFieldUpdateOperationsInput | string
    artifactId?: StringFieldUpdateOperationsInput | string
    sourceVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceVersionNo?: NullableIntFieldUpdateOperationsInput | number | null
    contentHash?: StringFieldUpdateOperationsInput | string
    ordinal?: IntFieldUpdateOperationsInput | number
    language?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    tokenCount?: IntFieldUpdateOperationsInput | number
    locators?: JsonNullValueInput | InputJsonValue
    claimIds?: JsonNullValueInput | InputJsonValue
    lexicalTerms?: JsonNullValueInput | InputJsonValue
    termFrequencies?: JsonNullValueInput | InputJsonValue
    lexicalText?: StringFieldUpdateOperationsInput | string
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Aliases for legacy arg types
   */
    /**
     * @deprecated Use SearchModelVersionCountOutputTypeDefaultArgs instead
     */
    export type SearchModelVersionCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = SearchModelVersionCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use SearchChunkCountOutputTypeDefaultArgs instead
     */
    export type SearchChunkCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = SearchChunkCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use SearchIndexTaskCountOutputTypeDefaultArgs instead
     */
    export type SearchIndexTaskCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = SearchIndexTaskCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use SearchSchemaMetaDefaultArgs instead
     */
    export type SearchSchemaMetaArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = SearchSchemaMetaDefaultArgs<ExtArgs>
    /**
     * @deprecated Use SearchModelVersionDefaultArgs instead
     */
    export type SearchModelVersionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = SearchModelVersionDefaultArgs<ExtArgs>
    /**
     * @deprecated Use SearchChunkDefaultArgs instead
     */
    export type SearchChunkArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = SearchChunkDefaultArgs<ExtArgs>
    /**
     * @deprecated Use SearchEmbeddingDefaultArgs instead
     */
    export type SearchEmbeddingArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = SearchEmbeddingDefaultArgs<ExtArgs>
    /**
     * @deprecated Use SearchIndexTaskDefaultArgs instead
     */
    export type SearchIndexTaskArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = SearchIndexTaskDefaultArgs<ExtArgs>
    /**
     * @deprecated Use SearchQueryMetricDefaultArgs instead
     */
    export type SearchQueryMetricArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = SearchQueryMetricDefaultArgs<ExtArgs>

  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}