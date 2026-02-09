import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';
import { GetUserTransactionsRequestDto } from './get-user-transaction-request.request';

export enum ExportFormat {
  Excel = 'excel',
  Pdf = 'pdf',
}

export class GetTransactionsRequestDto extends GetUserTransactionsRequestDto {
  @ApiPropertyOptional({ description: 'Search by user id' })
  @IsOptional()
  @IsNumber()
  userId?: number;

  // @ApiPropertyOptional()
  // @IsOptional()
  // @IsBoolean()
  // @Transform((params) =>
  //   params.obj.export === 'false' || params.obj.export === '0'
  //     ? false
  //     : params.value,
  // )
  // export?: boolean;

  // @ApiPropertyOptional({ default: ExportFormat.Excel })
  // @IsOptional()
  // @IsEnum(ExportFormat)
  // exportFormat?: ExportFormat;
}
