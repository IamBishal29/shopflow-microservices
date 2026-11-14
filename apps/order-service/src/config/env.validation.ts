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
 * The only environment variables order-service reads. Validated once at startup;
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
  readonly ORDER_SERVICE_PORT: number = 3001;

  // `!`: no sensible default exists; validateEnv rejects the object if it is missing.
  @Expose()
  @IsString()
  @Matches(/^postgres(ql)?:\/\/\S+$/, {
    message: 'ORDER_DATABASE_URL must be a postgresql:// connection string',
  })
  readonly ORDER_DATABASE_URL!: string;

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
  readonly KAFKA_CLIENT_ID: string = 'order-service';

  /** Consumer group for the events order-service consumes (payment results, #13). */
  @Expose()
  @IsString()
  @Length(1, 64)
  readonly KAFKA_GROUP_ID: string = 'order-service';

  /** Tries per message (first delivery + retries) before it goes to the DLQ. */
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  readonly CONSUMER_MAX_ATTEMPTS: number = 4;

  /** Backoff ceiling for the first retry; doubles per attempt (full jitter, max 30 s). */
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30_000)
  readonly CONSUMER_RETRY_BASE_MS: number = 1_000;
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
