import { STATUS_CODES } from 'node:http';
import { applyDecorators } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiSchema,
  getSchemaPath,
} from '@nestjs/swagger';
import { PROBLEM_CONTENT_TYPE, ProblemDetails } from '@shopflow/errors';

/**
 * OpenAPI schema for the RFC 9457 error body. `implements ProblemDetails`: if the filter's
 * type gains a required field, this class stops compiling until the docs follow.
 */
@ApiSchema({ name: 'ProblemDetails' })
export class ProblemDetailsSchema implements ProblemDetails {
  @ApiProperty({ example: 'urn:shopflow:problem:order-not-found' })
  readonly type!: string;

  @ApiProperty({ example: 'Order not found' })
  readonly title!: string;

  @ApiProperty({ example: 404 })
  readonly status!: number;

  @ApiPropertyOptional({ example: 'Order 0b8f6c1e-4a2d-4c3b-9f1e-2d7a5b6c8e90 not found' })
  readonly detail?: string;

  @ApiPropertyOptional({ example: '/orders/0b8f6c1e-4a2d-4c3b-9f1e-2d7a5b6c8e90' })
  readonly instance?: string;

  @ApiProperty({ description: 'Stable, machine-readable error code.', example: 'ORDER_NOT_FOUND' })
  readonly code!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  readonly timestamp?: string;

  @ApiPropertyOptional({ description: 'Echo of x-correlation-id, for support and logs.' })
  readonly correlationId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Field messages; only for VALIDATION_FAILED.',
    example: ['currency must be an ISO 4217 code like EUR'],
  })
  readonly errors?: readonly string[];
}

/** Documents the listed error statuses as application/problem+json bodies. */
export function ApiProblemResponses(...statuses: readonly number[]): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ProblemDetailsSchema),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: STATUS_CODES[status],
        content: {
          [PROBLEM_CONTENT_TYPE]: { schema: { $ref: getSchemaPath(ProblemDetailsSchema) } },
        },
      }),
    ),
  );
}
