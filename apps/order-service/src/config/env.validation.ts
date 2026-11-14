import 'reflect-metadata';
import { Expose, plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Matches, Max, Min, validateSync } from 'class-validator';

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
