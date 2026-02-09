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
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { BannersService } from './banners.service';
import {
  CreateBannerRequestDto,
  GetBannersRequestDto,
  UpdateBannerRequestDto,
} from './dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AccessGuard,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  SentryExceptionFilter,
  UserType,
} from '@Common';

@ApiTags('Banner')
@UseFilters(SentryExceptionFilter)
@Controller('banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Get('admin')
  async getAll(@Query() query: GetBannersRequestDto) {
    return await this.bannersService.getAll(query);
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Post()
  async create(@Body() data: CreateBannerRequestDto) {
    return await this.bannersService.create(data);
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Patch('update-banner/:id')
  async updateBanner(
    @Param('id') id: number,
    @Body() body: UpdateBannerRequestDto,
  ) {
    return await this.bannersService.updateBanner(id, body);
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return await this.bannersService.delete(id);
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number) {
    return await this.bannersService.update(id);
  }

  @Get()
  async getPublic(@Query() query: GetBannersRequestDto) {
    return await this.bannersService.getAllPubliced(query);
  }
}
