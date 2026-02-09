import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { StakesetService } from './stakeset.service';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  SentryExceptionFilter,
} from '@Common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UpdateStakeSetRequest } from './dto';

@UseFilters(SentryExceptionFilter)
@Controller('stakeset')
export class StakesetController extends BaseController {
  constructor(private readonly stakesetService: StakesetService) {
    super({ loggerDefaultMeta: { controller: StakesetController.name } });
  }

  @ApiBearerAuth()
  @Get()
  @UseGuards(JwtAuthGuard)
  async getStakeSet(@Req() req: AuthenticatedRequest) {
    const ctx = this.getContext(req);
    const stakeSet = await this.stakesetService.getStakeSet(ctx.user.id);
    return {
      success: true,
      message: 'Stake fetched successfully',
      stakeSet,
    };
  }

  @ApiBearerAuth()
  @Put()
  @UseGuards(JwtAuthGuard)
  async updateStakeSet(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateStakeSetRequest,
  ) {
    const ctx = this.getContext(req);
    const stakeSet = await this.stakesetService.updateStakeSet(
      ctx.user.id,
      body,
    );
    return {
      success: true,
      message: 'Stake updated successfully',
      stakeSet,
    };
  }
}
