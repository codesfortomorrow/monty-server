import { ApiProperty } from '@nestjs/swagger';
import { IsStrongPassword } from 'class-validator';

export class ChangeUserPasswordRequest {
  @ApiProperty({ description: 'Set new password, password must be strong' })
  @IsStrongPassword()
  newPassword: string;

  // @ApiProperty({ description: 'Your transaction code for verification' })
  // @IsString()
  // transactionCode: string;
}
