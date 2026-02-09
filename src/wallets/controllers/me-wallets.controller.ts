import { Controller, Get, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AccessGuard,
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  SentryExceptionFilter,
  UserType,
} from '@Common';
import { WalletsService } from '../wallets.service';
import { Wallet } from '@prisma/client';

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AccessGuard)
@Controller('users/me/wallets')
export class MeWalletsController extends BaseController {
  constructor(private readonly walletsService: WalletsService) {
    super();
  }

  @UseFilters(SentryExceptionFilter)
  @Get()
  async getAll(@Req() req: AuthenticatedRequest) {
    const ctx = this.getContext(req);
    let wallets: Wallet[];
    if (ctx.user.type === UserType.User) {
      wallets = await this.walletsService.getAllByUserId(BigInt(ctx.user.id));
    } else {
      const wallet = await this.walletsService.getByAdminId(
        BigInt(ctx.user.id),
      );
      wallets = [wallet];
    }
    return wallets;
  }
}
