import { ApiProperty } from '@nestjs/swagger';
import { BonusStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateBonusStatusDto {
  @ApiProperty({
    enum: BonusStatus,
    example: BonusStatus.Active,
    description: 'Enable or disable the bonus',
  })
  @IsEnum(BonusStatus)
  status: BonusStatus;
}
