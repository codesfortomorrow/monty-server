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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import {
  CreateNotificationDto,
  UpdateNotificationDto,
  GetNotificationRequestDto,
} from './dto';
import {
  JwtAuthGuard,
  AccessGuard,
  RolesGuard,
  Roles,
  UserType,
  SentryExceptionFilter,
} from '@Common';

@ApiTags('Notification')
@UseFilters(SentryExceptionFilter)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Post()
  @Post('create')
  async create(@Body() data: CreateNotificationDto) {
    const notification = await this.notificationService.create(data);
    return {
      success: true,
      message: 'Notification created successfully',
      data: notification,
    };
  }

  @Get()
  async getAllActive(@Query() query: GetNotificationRequestDto) {
    return await this.notificationService.getAllActive(query);
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Get('admin')
  async getAllAdmin(@Query() query: GetNotificationRequestDto) {
    const data = this.notificationService.getAll(query);
    return data;
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateNotificationDto,
  ) {
    return await this.notificationService.update(id, data);
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Patch(':id/toggle')
  async toggle(@Param('id', ParseIntPipe) id: number) {
    return await this.notificationService.toggleActive(id);
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return await this.notificationService.delete(id);
  }
}
