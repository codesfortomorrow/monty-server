import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { Notification, Prisma, NotificationType } from '@prisma/client';
import {
  CreateNotificationDto,
  GetNotificationRequestDto,
  UpdateNotificationDto,
} from './dto';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateNotificationDto): Promise<Notification> {
    if (!data.title || !data.body) {
      throw new BadRequestException('Title and body are required');
    }
    const notificationType = data.type ?? NotificationType.Alert;
    const payload = data.data ?? {};
    const isActive = data.isActive ?? true;
    const notification = await this.prisma.notification.create({
      data: {
        title: data.title.trim(),
        body: data.body.trim(),
        type: notificationType,
        data: payload,
        isActive,
      },
    });
    return notification;
  }

  async getAll(options: GetNotificationRequestDto) {
    let take = undefined,
      skip = undefined;
    if (
      options.page &&
      options.limit &&
      !isNaN(options.limit) &&
      !isNaN(options.page)
    ) {
      options.page = options.page < 1 ? 1 : options.page;
      take = options.limit;
      skip = (options.page - 1) * options.limit;
    }

    const where: Prisma.NotificationWhereInput = {};
    if (options.type) {
      where.type = options.type;
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const grouped: any = {};

    for (const item of data) {
      const type = item.type;

      if (!grouped[type]) grouped[type] = [];

      grouped[type].push(item);
    }

    const totalPage = Math.ceil(
      total /
        (options.limit && options.limit > 0
          ? options.limit
          : total < 1
            ? 1
            : total),
    );

    return {
      data: data,
      pagination: {
        total,
        limit: take ?? total,
        currentPage: options.page ?? 1,
        totalPage,
      },
    };
  }

  async getAllActive(options: GetNotificationRequestDto) {
    let take = undefined,
      skip = undefined;

    if (
      options.page &&
      options.limit &&
      !isNaN(options.limit) &&
      !isNaN(options.page)
    ) {
      options.page = options.page < 1 ? 1 : options.page;
      take = options.limit;
      skip = (options.page - 1) * options.limit;
    }

    const where: Prisma.NotificationWhereInput = {
      isActive: true,
    };

    if (options.type) {
      where.type = options.type;
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const grouped: any = {};

    for (const item of data) {
      const type = item.type;

      if (!grouped[type]) grouped[type] = [];

      grouped[type].push(item);
    }

    const totalPage = Math.ceil(
      total /
        (options.limit && options.limit > 0
          ? options.limit
          : total < 1
            ? 1
            : total),
    );

    return {
      data: grouped,
      pagination: {
        total,
        limit: take ?? total,
        currentPage: options.page ?? 1,
        totalPage,
      },
    };
  }

  async findOne(id: number): Promise<Notification | null> {
    return await this.prisma.notification.findUnique({
      where: { id },
    });
  }

  async update(id: number, data: UpdateNotificationDto): Promise<Notification> {
    const notification = await this.findOne(id);
    if (!notification) throw new Error('Notification not found');
    const notificationType = data.type ?? NotificationType.Alert;
    const payload = data.data ?? {};
    const isActive = data.isActive ?? true;
    return await this.prisma.notification.update({
      where: { id },
      data: {
        title: data.title,
        body: data.body,
        type: notificationType,
        data: payload,
        isActive,
      },
    });
  }

  async toggleActive(id: number): Promise<Notification> {
    const notification = await this.findOne(id);
    if (!notification) throw new Error('Notification not found');

    return await this.prisma.notification.update({
      where: { id },
      data: { isActive: !notification.isActive },
    });
  }

  async delete(id: number): Promise<{ status: string }> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: id },
    });
    if (!notification) throw new Error('message Notification NotFound');

    await this.prisma.notification.delete({
      where: { id },
    });

    return { status: 'success' };
  }
}
