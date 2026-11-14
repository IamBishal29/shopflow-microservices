/**
 * The slice of a Prisma client that shared libraries need. Each service passes its own
 * generated PrismaService (DatabaseModule.forRoot); libs never import a service's
 * generated types, so they work with any database a service owns.
 */
export interface SqlClient {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

export interface TransactionalSqlClient extends SqlClient {
  $transaction<R>(work: (tx: SqlClient) => Promise<R>, options?: { timeout?: number }): Promise<R>;
}

/** Injection token for the service's TransactionalSqlClient. */
export const DATABASE = Symbol('DATABASE');
