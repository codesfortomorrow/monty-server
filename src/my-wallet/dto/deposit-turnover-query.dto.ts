import { PaginationRequest } from '@Common';
import { IsOptional, IsInt, Min, IsEnum } from 'class-validator';

export enum TurnoverStatus {
  Pending = 'Pending',
  InProgress = 'InProgress',
  Completed = 'Completed',
}

export class DepositTurnoverQueryDto extends PaginationRequest {
  @IsOptional()
  @IsEnum(TurnoverStatus)
  status?: TurnoverStatus;
}
