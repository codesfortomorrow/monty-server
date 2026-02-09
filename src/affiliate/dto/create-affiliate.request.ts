import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAffiliateDto {
  @ApiProperty({
    description: 'Reason for approval or rejection',
    required: false,
  })
  @IsNotEmpty()
  @IsString()
  reasonFrom: string;
}
