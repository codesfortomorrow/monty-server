import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CryptoService } from './crypto.service';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  PaginationRequest,
  SentryExceptionFilter,
} from '@Common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateCryptoDepositWithdrawRequestDto,
  CreateCryptoWalletDto,
} from './dto';

@ApiTags('Crypto')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseFilters(SentryExceptionFilter)
@Controller('crypto')
export class CryptoController extends BaseController {
  constructor(private readonly cryptoService: CryptoService) {
    super();
  }

  @Post()
  async createDigital(
    @Req() req: AuthenticatedRequest,
    @Body() data: CreateCryptoWalletDto,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return await this.cryptoService.addCryptoWallet(
      userId,
      ctx.user.type,
      data,
    );
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return await this.cryptoService.toggleCryptoStatus(
      userId,
      ctx.user.type,
      BigInt(id),
    );
  }

  @Delete(':id')
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return await this.cryptoService.deleteCryptoWallet(
      userId,
      ctx.user.type,
      BigInt(id),
    );
  }

  @Get()
  async getUsercrypto(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationRequest,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return await this.cryptoService.listCryptoWallets(
      userId,
      ctx.user.type,
      query,
    );
  }

  @UseFilters(SentryExceptionFilter)
  @Post('deposit-withdraw-request')
  async createDepositWithdrawRequest(
    @Req() req: AuthenticatedRequest,
    @Body() data: CreateCryptoDepositWithdrawRequestDto,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return await this.cryptoService.createCryptoDepositWithdrawRequest(
      userId,
      data,
    );
  }

  @Get('networks')
  async getAll() {
    return {
      success: true,
      data: await this.cryptoService.getUsdtOnly(),
    };
  }
}
