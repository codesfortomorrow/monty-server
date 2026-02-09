import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class ChangeStatusRequest {
  //   @ApiProperty({
  //     description: 'The userId of the user whose status needs to be updated',
  //   })
  //   @IsOptional()
  //   @IsNumber()
  //   userId?: number;

  @ApiProperty({
    description: 'New status to apply to the user and all downline users',
    enum: UserStatus,
  })
  @IsNotEmpty()
  @IsEnum(UserStatus)
  status: UserStatus;
}
