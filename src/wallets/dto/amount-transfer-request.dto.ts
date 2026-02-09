import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class AmountTransferDto {
  @IsArray()
  userIds: bigint[];

  @IsNumber()
  allAmount: number;

  @IsOptional()
  @IsString()
  remark?: string;
}
