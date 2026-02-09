import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty({
    description: 'Bank account number',
    example: '1234567890',
  })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiProperty({
    description: 'Bank name',
    example: 'Exim Bank',
  })
  @IsString()
  @IsNotEmpty()
  bankName: string;

  @ApiProperty({
    description: 'Branch name (Bangladesh)',
    example: 'Gulshan Branch',
  })
  @IsString()
  @IsNotEmpty()
  branchName: string;

  @ApiProperty({
    description: 'District name (Bangladesh)',
    example: 'Dhaka',
  })
  @IsString()
  @IsNotEmpty()
  district: string;

  @ApiProperty({
    description: 'Account holder name',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  accountHolder: string;
}
