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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  PaginationRequest,
  SentryExceptionFilter,
} from '@Common';
import { PaymentService } from './payment.service';
import {
  CreateBankAccountDto,
  CreateDepositWithdrawRequestDto,
  CreateDigitalPaymentDto,
} from './dto';

@ApiTags('Payment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseFilters(SentryExceptionFilter)
@Controller('payment')
export class PaymentController extends BaseController {
  constructor(private readonly paymentService: PaymentService) {
    super();
  }

  @Post('ewallet')
  async createDigital(
    @Req() req: AuthenticatedRequest,
    @Body() data: CreateDigitalPaymentDto,
  ) {
    const ctx = this.getContext(req);
    return await this.paymentService.createDigitalPayment(
      ctx.user.id,
      ctx.user.type,
      data,
    );
  }

  // @Post('bank')
  // async createBank(
  //   @Req() req: AuthenticatedRequest,
  //   @Body() data: CreateBankAccountDto,
  // ) {
  //   const ctx = this.getContext(req);
  //   return await this.paymentService.createBankAccount(ctx.user.id, data);
  // }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    return await this.paymentService.toggleStatus(
      ctx.user.id,
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
    return await this.paymentService.deleteEwallet(
      ctx.user.id,
      ctx.user.type,
      BigInt(id),
    );
  }

  @Get()
  async listUpiId(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationRequest,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return await this.paymentService.listDigitalPayments(
      userId,
      ctx.user.type,
      query,
    );
  }

  @UseFilters(SentryExceptionFilter)
  @Post('deposit-withdraw-request')
  async createDepositWithdrawRequest(
    @Req() req: AuthenticatedRequest,
    @Body() data: CreateDepositWithdrawRequestDto,
  ) {
    const ctx = this.getContext(req);
    return await this.paymentService.createDepositWithdrawRequest(
      ctx.user.id,
      ctx.user.type,
      data,
    );
  }
}
