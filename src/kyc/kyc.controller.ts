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
  UseGuards,
} from '@nestjs/common';
import { KycService } from './kyc.service';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  UserType,
} from '@Common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateKycDto, GetKycDto } from './dto';
import { UpdateKycStatusDto } from './dto/update-kyc-status.request';
import { UpdateKycDetailDto } from './dto/update-kyc-detail.request';

@ApiTags('Kyc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController extends BaseController {
  constructor(private readonly kycService: KycService) {
    super();
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Get('userKyc')
  async getAllKyc(@Query() dto: GetKycDto) {
    return this.kycService.getAllKyc(dto);
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Patch('kyc/:id')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKycStatusDto,
  ) {
    return this.kycService.updateStatus(BigInt(id), dto);
  }

  @Post('create')
  async createAffiliate(
    @Body() dto: CreateKycDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.kycService.submitKyc(userId, dto);
  }

  @Get('me')
  getUserKyc(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    return this.kycService.getUserKyc(BigInt(userId));
  }

  @Patch('update-detail')
  updateKycDetail(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateKycDetailDto,
  ) {
    return this.kycService.updateKycDetail(req.user.id, dto);
  }

  @Delete(':id')
  deleteKycById(@Param('id', ParseIntPipe) id: number) {
    return this.kycService.deleteKycById(BigInt(id));
  }
}
