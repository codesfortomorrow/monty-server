import {
  Controller,
  Get,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { MyWalletService } from './my-wallet.service';
import {
  AccessGuard,
  AuthenticatedRequest,
  JwtAuthGuard,
  SentryExceptionFilter,
} from '@Common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DepositTurnoverQueryDto } from './dto/deposit-turnover-query.dto';

@ApiTags('My Wallet')
@ApiBearerAuth()
@UseFilters(SentryExceptionFilter)
@UseGuards(JwtAuthGuard, AccessGuard)
@Controller('my-wallet')
export class MyWalletController {
  constructor(private readonly myWalletService: MyWalletService) {}

  @Get('summary')
  async getWalletSummary(@Req() req: AuthenticatedRequest) {
    console.log('userId : ', req.user);
    const userId = BigInt(req.user.id);
    return this.myWalletService.getWalletSummary(userId);
  }

  @Get()
  async getDepositTurnovers(
    @Req() req: AuthenticatedRequest,
    @Query() query: DepositTurnoverQueryDto,
  ) {
    const userId = BigInt(req.user.id); // from auth guard
    return this.myWalletService.getDepositTurnovers(userId, query);
  }
}
