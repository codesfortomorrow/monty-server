import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateKycDto {
  @ApiProperty({
    description: 'Card number of the user',
    example: '1234-5678-9876-5432',
  })
  @IsString()
  @IsNotEmpty()
  cardNumber: string;

  @ApiProperty({
    description: 'Front image of the card',
    example: 'https://example.com/uploads/front.jpg',
  })
  @IsString()
  @IsNotEmpty()
  frontImage: string;

  @ApiProperty({
    description: 'Back image of the card',
    example: 'https://example.com/uploads/back.jpg',
  })
  @IsString()
  @IsNotEmpty()
  backImage: string;
}
