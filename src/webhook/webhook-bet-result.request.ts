import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class WebhookMarketResultDto {
  @IsString()
  @IsNotEmpty()
  market: string;

  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsNotEmpty()
  marketId: string;

  // Accepts both number & string as input but transforms to string
  @IsString()
  @IsNotEmpty()
  @Type(() => String)
  selectionId: string;

  @IsString()
  @IsNotEmpty()
  @Type(() => String)
  result: string;

  @IsOptional()
  @IsNumber()
  isRollback?: number;

  @IsOptional()
  @IsString()
  timestamp?: string;
}
