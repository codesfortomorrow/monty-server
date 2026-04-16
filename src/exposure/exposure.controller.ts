import {
  Controller,
  Get,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { GetBookSetCalcDto } from './dto/get-booksetcalc.request';
import { ExposureService } from './exposure.service';
import {
  GetMarketBookSetCalcDto,
  GetSessionPLDto,
  UserWiseBreakDownRequest,
} from './dto';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  SentryExceptionFilter,
  UserType,
} from '@Common';
import { GetUsersBookSetCalcDto } from './dto/get-all-user-bookset.request';

@ApiTags('Exposure')
@UseFilters(SentryExceptionFilter)
@Controller('exposure')
export class ExposureController extends BaseController {
  constructor(private readonly exposureService: ExposureService) {
    super({ loggerDefaultMeta: { controller: ExposureController.name } });
  }

  @ApiBearerAuth()
  @Get('/bookset/calculation')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({
    status: 200,
    description: 'Market-wise exposure grouped by marketId',
    schema: {
      example: [
        {
          marketId: 2101,
          marketExternalId: 'MATCH_ODDS',
          selections: [
            { selectionId: '123', exposure: 1200 },
            { selectionId: '456', exposure: -400 },
          ],
        },
      ],
    },
  })
  async getBookSetCalc(
    @Query() dto: GetBookSetCalcDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    return this.exposureService.getBookSetCalc(dto, ctx.user.id);
  }

  @ApiBearerAuth()
  @Get('/profit-loss')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({
    status: 200,
    description: 'Run-wise profit/loss calculation for session market',
  })
  async getSessionPL(
    @Query() dto: GetSessionPLDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    return this.exposureService.getSessionPLByUser(
      dto,
      ctx.user.id,
      ctx.user.path,
      ctx.user.type,
    );
  }

  @ApiBearerAuth()
  @Get('/top-users')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({
    status: 200,
    description: 'Top 10 user with highest exposure',
  })
  async getUserwithTopExposure(@Req() req: AuthenticatedRequest) {
    const ctx = this.getContext(req);
    return this.exposureService.getUserwithTopExposure(ctx.user.path);
  }
  @ApiBearerAuth()
  @Get('allusers/bookset-by-sport')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({
    status: 200,
    description: 'bookset-by-sport',
  })
  async getAllUsersBooksetBySport(
    @Query() query: GetUsersBookSetCalcDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    return this.exposureService.getAllUsersBooksetBySport(
      ctx.user.id,
      ctx.user.type,
      ctx.user.path,
      query.sport,
    );
  }
  @ApiBearerAuth()
  @Get('/get-market-exposure')
  @UseGuards(JwtAuthGuard) // <-- Add this guard here
  async getMarketBookSetCalc(
    @Query() dto: GetMarketBookSetCalcDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    return this.exposureService.getMarketBookSetCalc(
      dto,
      dto.userpath || ctx.user.path,
      ctx.user.id,
      ctx.user.type,
    );
  }

  // @ApiBearerAuth()
  // @Get('/get-userwise-breakdown')
  // @UseGuards(JwtAuthGuard)
  // async GetUserWiseBreakdown(
  //   @Query() dto: UserWiseBreakDownRequest,
  //   @Req() req: AuthenticatedRequest,
  // ) {
  //   const ctx = this.getContext(req);
  //   const { rows, pagination } =
  //     await this.exposureService.GetDownlineWiseBreakdown(
  //       dto,
  //       dto.uplineId ? BigInt(dto.uplineId) : ctx.user.id,
  //       dto.userType ? (dto.userType as UserType) : ctx.user.type,
  //     );

  //   return {
  //     success: true,
  //     message: 'Userwise exposure breakdown fetched successfully',
  //     downlines: rows,
  //     pagination,
  //     // uplines,
  //   };
  // }

  @ApiBearerAuth()
  @Get('/get-userwise-breakdown')
  @UseGuards(JwtAuthGuard)
  async GetUserWiseBreakdown(
    @Query() dto: UserWiseBreakDownRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    const { data, uplines } =
      await this.exposureService.GetDownlineWiseBreakdown(
        dto,
        Number(dto.uplineId) ? BigInt(dto.uplineId) : ctx.user.id,
        Number(dto.uplineId) ? UserType.User : ctx.user.type,
      );

    return {
      success: true,
      message: 'Userwise exposure breakdown fetched successfully',
      downlines: data,
      uplines,
    };
  }
}
