import 'reflect-metadata';
import { Expose, plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

/**
 * The only environment variables payment-service reads. Validated once at startup;
 * anything else in process.env is ignored.
 */
export class EnvironmentVariables {
  @Expose()
  @IsIn(NODE_ENVS)
  readonly NODE_ENV: NodeEnv = 'development';

  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  readonly PAYMENT_SERVICE_PORT: number = 3002;

  // `!`: no sensible default exists; validateEnv rejects the object if it is missing.
  @Expose()
  @IsString()
  @Matches(/^postgres(ql)?:\/\/\S+$/, {
    message: 'PAYMENT_DATABASE_URL must be a postgresql:// connection string',
  })
  readonly PAYMENT_DATABASE_URL!: string;

  /** Comma-separated host:port list, e.g. "localhost:9092" or "kafka-0:9092,kafka-1:9092". */
  // `!`: required like the DB URL; a silent localhost default would hide a missing prod setting.
  @Expose()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((broker) => broker.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayNotEmpty({ message: 'KAFKA_BROKERS must list at least one broker' })
  @Matches(/^[A-Za-z0-9.-]+:\d{1,5}$/, {
    each: true,
    message: 'KAFKA_BROKERS entries must be host:port',
  })
  readonly KAFKA_BROKERS!: string[];

  @Expose()
  @IsString()
  @Length(1, 64)
  readonly KAFKA_CLIENT_ID: string = 'payment-service';

  /** Consumer group for the order.created.v1 consumer (#10). */
  @Expose()
  @IsString()
  @Length(1, 64)
  readonly KAFKA_GROUP_ID: string = 'payment-service';

  /** Dummy charge rule: orders above this total (in cents) are declined. Default 1000.00. */
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  readonly PAYMENT_DECLINE_ABOVE_CENTS: number = 100_000;
}

/**
 * Passed to ConfigModule.forRoot({ validate }). Throws one error listing every
 * problem, without echoing values (they may contain credentials).
 */
export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, raw, {
    excludeExtraneousValues: true,
    exposeDefaultValues: true,
  });
  const errors = validateSync(env, {
    skipMissingProperties: false,
    validationError: { target: false, value: false },
  });
  if (errors.length > 0) {
    const problems = errors.flatMap((e) =>
      Object.values(e.constraints ?? {}).map((m) => `  - ${m}`),
    );
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  return env;
}
