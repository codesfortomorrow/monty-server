import { ApiProperty } from '@nestjs/swagger';

export class CasinoCreditRequest {
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
  creditAmount: number;

  @ApiProperty()
  betType: string;
}
