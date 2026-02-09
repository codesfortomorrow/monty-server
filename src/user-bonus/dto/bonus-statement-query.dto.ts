import { DateFilterWithPaginationRequest } from '@Common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { BonusApplicantStatusType, BonusCategory } from '@prisma/client';

export class BonusStatementDTO extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ enum: BonusApplicantStatusType })
  @IsEnum(BonusApplicantStatusType)
  @IsOptional()
  status?: BonusApplicantStatusType;

  @ApiPropertyOptional({ enum: BonusCategory })
  @IsEnum(BonusCategory)
  @IsOptional()
  type?: BonusCategory;
}
