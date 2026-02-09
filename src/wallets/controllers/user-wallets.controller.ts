import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  SentryExceptionFilter,
} from '@Common';
import { WalletsService } from '../wallets.service';
import { CreditLimitRequest, UpdateBalanceRequest } from '../dto';
import { PrismaService } from '../../prisma';
import { AmountTransferDto } from '../dto/amount-transfer-request.dto';

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/:userId/wallets')
export class UserWalletsController extends BaseController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletsService: WalletsService,
  ) {
    super();
  }

  @UseFilters(SentryExceptionFilter)
  @Post('/deposit')
  async deposit(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: AuthenticatedRequest,
    @Body() data: UpdateBalanceRequest,
  ) {
    const ctx = this.getContext(req);
    await this.walletsService.depositeBalance(
      userId,
      ctx.user.id,
      ctx.user.type,
      data,
    );
    return {
      success: true,
      message: 'Deposit Successfull',
    };
  }

  @UseFilters(SentryExceptionFilter)
  @Post('/withdraw')
  async withdraw(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: AuthenticatedRequest,
    @Body() data: UpdateBalanceRequest,
  ) {
    const ctx = this.getContext(req);
    await this.walletsService.withdrawBalance(
      userId,
      ctx.user.id,
      ctx.user.type,
      data,
    );
    return {
      success: true,
      message: 'Deposit Successfull',
    };
  }

  @UseFilters(SentryExceptionFilter)
  @Post('/give/credit-limit')
  async giveCreditLimit(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: CreditLimitRequest,
  ) {
    const ctx = this.getContext(req);
    await this.walletsService.giveCreditLimitToUser({
      userId,
      creatorId: ctx.user.id,
      userType: ctx.user.type,
      body,
    });
    return {
      success: true,
      message: 'Deposit successfully',
    };
  }

  @Post('settlement')
  async settlement(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AmountTransferDto,
  ) {
    const ctx = this.getContext(req);
    return this.walletsService.amountTransfer(ctx.user.id, dto);
  }
}
