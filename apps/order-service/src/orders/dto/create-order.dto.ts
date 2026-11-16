import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// `!` on DTO fields: ValidationPipe populates and validates them before the handler runs.

export class CreateOrderItemDto {
  @ApiProperty({ pattern: '^[A-Za-z0-9-]{1,64}$', example: 'SKU-1' })
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,64}$/, { message: 'sku must be 1-64 letters, digits or dashes' })
  readonly sku!: string;

  @ApiProperty({ minimum: 1, maximum: 1000, example: 2 })
  @IsInt()
  @Min(1)
  @Max(1000)
  readonly quantity!: number;

  /** Price per unit in minor units (cents). No catalogue in scope, so the client sends it. */
  @ApiProperty({ minimum: 0, maximum: 10_000_000, description: 'Minor units (cents).' })
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  readonly unitPriceCents!: number;
}

/** Input for POST /orders. There is deliberately no `totalCents` or `status`: the server owns them. */
export class CreateOrderDto {
  /**
   * Set by api-gateway from the JWT `sub` (client values are overwritten there). Trusted
   * because order-service must only be reachable through the gateway (NetworkPolicy in K8s).
   */
  @ApiProperty({
    minLength: 1,
    maxLength: 64,
    description: 'Set by api-gateway from the JWT sub; a client value is overwritten.',
  })
  @IsString()
  @Length(1, 64)
  readonly customerId!: string;

  @ApiProperty({ pattern: '^[A-Z]{3}$', description: 'ISO 4217 code.', example: 'EUR' })
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be an ISO 4217 code like EUR' })
  readonly currency!: string;

  @ApiProperty({ type: [CreateOrderItemDto], minItems: 1, maxItems: 50 })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  readonly items!: CreateOrderItemDto[];
}
