import { DynamicModule, Global, Module, Type } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health';
import { DATABASE, TransactionalSqlClient } from './sql-client';

export interface DatabaseModuleOptions {
  /** The service's PrismaService; the type check proves it satisfies the interface. */
  readonly client: Type<TransactionalSqlClient>;
}

/** Exposes the service's database as DATABASE, plus a readiness check for it. */
@Global()
@Module({})
export class DatabaseModule {
  static forRoot({ client }: DatabaseModuleOptions): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [TerminusModule],
      providers: [{ provide: DATABASE, useExisting: client }, DatabaseHealthIndicator],
      exports: [DATABASE, DatabaseHealthIndicator],
    };
  }
}
