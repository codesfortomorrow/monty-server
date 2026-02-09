import { PaginatedDto } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional } from 'class-validator';

export class GetNotificationRequestDto {
  @ApiPropertyOptional({ enum: NotificationType, enumName: 'NotificationType' })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({ description: 'Page number for pagination' })
  @IsNumber()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page' })
  @IsNumber()
  @IsOptional()
  limit?: number;
}
