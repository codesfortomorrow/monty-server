import { IsEnum } from 'class-validator';
import { KycStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateKycStatusDto {
  @ApiPropertyOptional({
    description: 'Status of the kyc',
    example: KycStatus.Approved,
    enum: KycStatus,
  })
  @IsEnum(KycStatus)
  status: KycStatus;
}
