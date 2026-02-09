import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RequestStatus } from '@prisma/client';

export class UpdateAffiliateStatusDto {
  @ApiProperty({
    example: RequestStatus.Approved,
    enum: RequestStatus,
  })
  @IsEnum(RequestStatus)
  requestStatus: RequestStatus;

  @ApiProperty({
    description: 'Reason for approval or rejection',
    required: false,
  })
  @IsOptional()
  @IsString()
  reasonTo?: string;
}
