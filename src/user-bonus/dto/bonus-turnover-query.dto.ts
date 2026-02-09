export class CreateUserBonusDto {}
import { PaginatedDto, PaginationRequest } from '@Common';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export enum BonusTurnoverStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}

export class BonusTurnoverQueryDto extends PaginationRequest {
  @ApiProperty()
  @IsEnum(BonusTurnoverStatus)
  status: BonusTurnoverStatus;
}
