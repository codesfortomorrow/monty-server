import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsString, ValidateNested } from 'class-validator';

export class PermissionDto {
  @ApiProperty({ example: 'Cricket' })
  @IsString()
  name: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  allowed: boolean;
}
export class UpdateSportsPermissionRequest {
  @ApiProperty({
    type: [PermissionDto],
    example: [
      { name: 'Cricket', allowed: true },
      { name: 'Tenis', allowed: false },
      { name: 'Casino', allowed: true },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  data: PermissionDto[];

  // @ApiProperty({
  //   description: 'Your transaction code for verification',
  //   example: '12345',
  // })
  // @IsString()
  // transactionCode: string;
}
