import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Query for GET /orders. Bounded so one request cannot ask for an unbounded scan. */
export class ListOrdersQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit: number = 20;

  /** Deep offsets get slow (Postgres still reads skipped rows); keyset paging would lift this cap. */
  @ApiPropertyOptional({ minimum: 0, maximum: 10_000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  readonly offset: number = 0;
}
