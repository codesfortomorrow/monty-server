import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { TurnoverType } from '@prisma/client'; // import your enum
import { DateFilterWithPaginationRequest } from '@Common';

export class GetTurnoverHistoryDto extends DateFilterWithPaginationRequest {
  // @ApiPropertyOptional({ description: 'Search by event name or market' })
  // @IsOptional()
  // @IsString()
  // search?: string;

  @ApiPropertyOptional({
    description: 'Filter by turnover source type',
    enum: TurnoverType,
  })
  @IsOptional()
  @IsEnum(TurnoverType)
  sourceType?: TurnoverType;
}
