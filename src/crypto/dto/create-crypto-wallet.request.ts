import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateCryptoWalletDto {
  @ApiProperty({
    description: 'Wallet address of the crypto account',
    example: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
  })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  qrImage: string;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  networkId: number;

  @ApiProperty({ example: 100, required: false })
  @IsNumber()
  @IsOptional()
  minAmount?: number;

  @ApiProperty({ example: 100000, required: false })
  @IsNumber()
  @IsOptional()
  maxAmount?: number;
}
