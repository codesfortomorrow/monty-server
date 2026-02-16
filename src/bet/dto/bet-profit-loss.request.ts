import { PaginationRequest } from '@Common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
export enum SportFilterType {
  Cricket = 'Cricket',
  Football = 'Football',
  Tennis = 'Tennis',
  Soccer = 'Soccer',
  Casino = 'Casino',
  HorseRacing = 'HorseRacing',
  Greyhound = 'Greyhound',
}
export class BetProfitLossRequest extends PaginationRequest {
  @ApiProperty({ enum: SportFilterType })
  @IsEnum(SportFilterType)
  sport: SportFilterType;

  @ApiPropertyOptional({ description: 'Filter bet profit/loss by from date' })
  @IsDate()
  @IsOptional()
  fromDate?: Date;

  @ApiPropertyOptional({ description: 'Filter bet profit/loss by to date' })
  @IsDate()
  @IsOptional()
  toDate?: Date;

  @ApiPropertyOptional({ description: 'Search by event name' })
  @IsString()
  @IsOptional()
  search?: string;
}
