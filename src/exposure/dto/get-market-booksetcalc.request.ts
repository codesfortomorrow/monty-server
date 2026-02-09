import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ReportType } from 'src/reports/dto';

export class GetMarketBookSetCalcDto {
  @ApiProperty({ description: 'Event ID', example: 98765 })
  @IsNumber()
  @IsNotEmpty()
  eventId: number;

  @ApiProperty({ description: 'Market External ID', example: '98765' })
  @IsString()
  @IsNotEmpty()
  marketExtenralId: string;

  @ApiPropertyOptional({
    description: 'downline user path',
    example: '0.12.45',
  })
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  userpath: string;

  @ApiPropertyOptional({
    description: 'type of downline users direct/platform',
    example: 'direct',
  })
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  type: string;
}
