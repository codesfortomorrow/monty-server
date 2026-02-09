import { PaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExportFormat, UserStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class GetSubuserRequest extends PaginationRequest {
  @ApiPropertyOptional({ description: 'Limit the downline depth' })
  @IsNumber()
  @IsOptional()
  level?: number;

  @ApiPropertyOptional({ description: 'Filter by single roll' })
  @IsNumber()
  @IsOptional()
  rollId?: number;

  @ApiPropertyOptional({ description: 'Filter by username' })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({ description: 'Filter by upline' })
  @IsString()
  @IsOptional()
  upline?: string;
  @ApiPropertyOptional({ description: 'Filter by settlement' })
  @IsBoolean()
  @IsOptional()
  settlement?: boolean;
  @ApiPropertyOptional({ description: 'Filter by from date' })
  @IsDate()
  @IsOptional()
  fromDate?: Date;

  @ApiPropertyOptional({ description: 'Filter by to date' })
  @IsDate()
  @IsOptional()
  toDate?: Date;

  @ApiPropertyOptional({
    description: 'Filter by user status',
    enum: UserStatus,
  })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @ApiPropertyOptional({
    description: 'file name only for the exported report',
  })
  @IsString()
  @IsOptional()
  fileName?: string;

  @ApiPropertyOptional({
    description: 'Timezone in UTC offset format Asia/Kolkata',
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ enum: ExportFormat })
  @IsEnum(ExportFormat)
  @IsOptional()
  exportFormat?: ExportFormat;
}
