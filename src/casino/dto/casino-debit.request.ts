import { ApiProperty } from '@nestjs/swagger';

export class CasinoDebitRequest {
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
  debitAmount: number;

  @ApiProperty()
  betType: string;
}
