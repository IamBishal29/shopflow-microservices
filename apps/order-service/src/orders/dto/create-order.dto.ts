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
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,64}$/, { message: 'sku must be 1-64 letters, digits or dashes' })
  readonly sku!: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  readonly quantity!: number;

  /** Price per unit in minor units (cents). No catalogue in scope, so the client sends it. */
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  readonly unitPriceCents!: number;
}

/** Input for POST /orders. There is deliberately no `totalCents` or `status`: the server owns them. */
export class CreateOrderDto {
  /** Until JWT auth (#16) the caller names the customer; then it comes from the token. */
  @IsString()
  @Length(1, 64)
  readonly customerId!: string;

  @Matches(/^[A-Z]{3}$/, { message: 'currency must be an ISO 4217 code like EUR' })
  readonly currency!: string;

  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  readonly items!: CreateOrderItemDto[];
}
