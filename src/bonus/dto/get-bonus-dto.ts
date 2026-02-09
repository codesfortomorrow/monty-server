import { ApiPropertyOptional } from '@nestjs/swagger';
import { BonusCategory, BonusStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DateFilterWithPaginationRequest } from '@Common';

export class GetBonusQueryDto extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ enum: BonusStatus })
  @IsOptional()
  @IsEnum(BonusStatus)
  status?: BonusStatus;

  @ApiPropertyOptional({ enum: BonusCategory })
  @IsOptional()
  @IsEnum(BonusCategory)
  category?: BonusCategory;

  @ApiPropertyOptional({ description: 'search by bonus name.' })
  @IsString()
  @IsOptional()
  search?: string;
}
