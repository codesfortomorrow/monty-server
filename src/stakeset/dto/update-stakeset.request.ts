import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';

export class StakeSetDto {
  @ApiProperty({ example: '1k' })
  @IsString()
  label: string;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  value: number;
}
export class UpdateStakeSetRequest {
  @ApiProperty({
    type: [StakeSetDto],
    example: [
      { label: '1k', value: 1000 },
      { label: '5k', value: 5000 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StakeSetDto)
  data: StakeSetDto[];
}
