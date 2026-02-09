import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  PaginationRequest,
  SentryExceptionFilter,
} from '@Common';
import { BankService } from './bank.service';
import { CreateBankDto, CreateBankTransactionDto, UpdateBankDto } from './dto';
import { CacheTTL } from '@nestjs/cache-manager';

@ApiTags('Bank')
@UseFilters(SentryExceptionFilter)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bank')
export class BankController extends BaseController {
  constructor(private readonly bankService: BankService) {
    super();
  }

  @Post()
  async addBank(@Req() req: AuthenticatedRequest, @Body() body: CreateBankDto) {
    const ctx = this.getContext(req);
    return this.bankService.addBank(ctx.user.id, ctx.user.type, body);
  }

  @Delete(':id')
  async deleteBank(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    return this.bankService.deleteBank(BigInt(id), ctx.user.id, ctx.user.type);
  }

  @Get()
  async listBank(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationRequest,
  ) {
    const ctx = this.getContext(req);
    return this.bankService.listBank(ctx.user.id, ctx.user.type, query);
  }

  @Patch('activate/:id')
  async activateUpi(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;

    return await this.bankService.activateBank(
      BigInt(userId),
      ctx.user.type,
      BigInt(id),
    );
  }

  @Post('deposit-withdraw-request')
  async createDepositWithdrawRequest(
    @Req() req: AuthenticatedRequest,
    @Body() data: CreateBankTransactionDto,
  ) {
    const ctx = this.getContext(req);
    return await this.bankService.createDepositWithdrawRequest(
      ctx.user.id,
      ctx.user.type,
      data,
    );
  }
}
