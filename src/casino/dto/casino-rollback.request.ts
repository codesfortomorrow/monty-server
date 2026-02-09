import { ApiProperty } from '@nestjs/swagger';

export class CasinoRollbackRequest {
  @ApiProperty()
  PartnerId: string;

  @ApiProperty()
  token: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  reqId: string;

  @ApiProperty()
  transactionId: string;

  @ApiProperty()
  gameId: string;

  @ApiProperty()
  roundId: string;

  @ApiProperty()
  rollbackAmount: number;

  @ApiProperty()
  betType: string;

  @ApiProperty()
  rollbackReason: string;
}
