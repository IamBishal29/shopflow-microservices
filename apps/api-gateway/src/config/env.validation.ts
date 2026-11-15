import 'reflect-metadata';
import { Expose, plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

/**
 * The only environment variables api-gateway reads. Validated once at startup;
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
  readonly GATEWAY_PORT: number = 3000;

  /** Base URL of order-service, e.g. http://localhost:3001 or http://order-service:3001. */
  // `!`: required; a localhost default would silently point production at nothing.
  @Expose()
  // Trailing slashes removed so `${base}/orders` never becomes `//orders`.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\/+$/, '') : value,
  )
  @IsUrl(
    { require_tld: false, require_protocol: true, protocols: ['http', 'https'] },
    { message: 'ORDER_SERVICE_URL must be an http(s) URL' },
  )
  readonly ORDER_SERVICE_URL!: string;

  /**
   * Upper bound for one downstream call. Keep it below the client's own timeout,
   * so the gateway answers 504 instead of the client giving up first.
   */
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(30_000)
  readonly DOWNSTREAM_TIMEOUT_MS: number = 3_000;

  /**
   * HS256 signing key. Anyone holding it can mint valid tokens, so it has no default and
   * must carry at least 256 bits (32+ chars), e.g. `openssl rand -base64 48`.
   */
  // `!`: required; a built-in fallback secret would be a backdoor shipped in the image.
  @Expose()
  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters' })
  readonly JWT_SECRET!: string;

  /** `iss` claim: who issued the token. Tokens from any other issuer are rejected. */
  @Expose()
  @IsString()
  @Length(1, 128)
  readonly JWT_ISSUER: string = 'shopflow-gateway';

  /** `aud` claim: which API the token is for, so a token for another API is useless here. */
  @Expose()
  @IsString()
  @Length(1, 128)
  readonly JWT_AUDIENCE: string = 'shopflow-api';

  /** Access-token lifetime. Short, because a JWT cannot be revoked before it expires. */
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86_400)
  readonly JWT_TTL_SECONDS: number = 900;
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
