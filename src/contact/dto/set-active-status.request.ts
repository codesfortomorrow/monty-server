import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class SetActiveStatusDto {
  @ApiProperty({
    example: true,
    description: 'Set to true to activate, false to deactivate',
  })
  @IsNotEmpty()
  isActive: boolean;
}
