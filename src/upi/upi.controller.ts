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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  PaginationRequest,
  SentryExceptionFilter,
} from '@Common';
import { UpiService } from './upi.service';
import { CreateUpiDto, CreateUpiTransactionDto, UpdateUpiDto } from './dto';
import { CacheTTL } from '@nestjs/cache-manager';

@ApiTags('Upi')
@UseFilters(SentryExceptionFilter)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upi')
export class UpiController extends BaseController {
  constructor(private readonly upiService: UpiService) {
    super();
  }

  @Post()
  async addUpi(@Req() req: AuthenticatedRequest, @Body() Body: CreateUpiDto) {
    const ctx = this.getContext(req);
    return this.upiService.addUpi(ctx.user.id, ctx.user.type, Body);
  }

  @Delete(':id')
  async deleteUpi(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return await this.upiService.deleteUpi(BigInt(id), userId, ctx.user.type);
  }

  @Get()
  async listUpiId(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationRequest,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return await this.upiService.listUpiId(userId, ctx.user.type, query);
  }

  @Patch(':id')
  async updateUpi(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateUpiDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;

    return await this.upiService.updateUpi(BigInt(userId), BigInt(id), data);
  }

  @Patch('activate/:id')
  async activateUpi(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;

    return await this.upiService.activateUpi(
      BigInt(userId),
      ctx.user.type,
      BigInt(id),
    );
  }

  @Post('deposit-withdraw-request')
  async createDepositWithdrawRequest(
    @Req() req: AuthenticatedRequest,
    @Body() data: CreateUpiTransactionDto,
  ) {
    const ctx = this.getContext(req);
    return await this.upiService.createUpiTransactionRequest(
      ctx.user.id,
      ctx.user.type,
      data,
    );
  }
}
