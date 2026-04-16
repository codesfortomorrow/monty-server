import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DeviceType,
  ExportFormat,
  ExportStatus,
  ExportType,
  LoginStatus,
  Prisma,
} from '@prisma/client';

import { Request } from 'express';
import {
  BaseService,
  DateFilterWithPaginationRequest,
  Pagination,
  UserType,
  UtilsService,
} from '@Common';

import { UsersService } from 'src/users';
import { firstValueFrom, timeout } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { activityLogConfigFactory } from '@Config';
import { ConfigType } from '@nestjs/config';
import axios from 'axios';
import { activityLogDto } from './dto';
import { RedisService } from 'src/redis';
import { AlertService } from 'src/alert/alert.service';

@Injectable()
export class ActivityService extends BaseService {
  private readonly REQUEST_TIMEOUT_MS = 5000; // 5 seconds
  private readonly CACHE_TTL = 5 * 24 * 60 * 60; // 5 days
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly utils: UtilsService,
    private readonly http: HttpService,
    private readonly redis: RedisService,
    private readonly alertService: AlertService,
    @Inject(activityLogConfigFactory.KEY)
    private readonly activityConfig: ConfigType<
      typeof activityLogConfigFactory
    >,
  ) {
    super({ loggerDefaultMeta: { service: ActivityService.name } });
  }

  private normalizeIp(ip: string): string {
    if (!ip) return '';

    if (ip.startsWith('::ffff:')) {
      return ip.replace('::ffff:', '');
    }

    return ip;
  }

  async loginActivity(options: {
    loginStatus: LoginStatus;
    ip?: string;
    userId?: bigint;
    userType?: UserType;
    remark?: string;
    device?: DeviceType;
  }) {
    let upline;
    if (
      options.loginStatus === LoginStatus.Success &&
      options.userType === UserType.User &&
      options.userId
    ) {
      const user = await this.usersService.getUplinePathById(options.userId);
      upline = user;
    }
    if (!upline && options.userType == UserType.Admin) {
      upline = '0';
    }
    const ip = options.ip || '';

    const ipAddress = this.normalizeIp(ip);

    let isp: string | undefined;
    let city: string | undefined;
    let state: string | undefined;
    let country: string | undefined;

    const redisKey = `activity:ip:${ipAddress}`;

    const data = await this.redis.client.get(redisKey);
    if (data) {
      try {
        const result = JSON.parse(data);
        isp = result.connection?.isp;
        city = result.city;
        state = result.region;
        country = result.country;
      } catch (error) {
        this.logger.error(`Error to parse activity data, ${error.message}`);
        await this.redis.client.del(redisKey);
      }
    } else {
      const baseUrl = this.activityConfig.activityBaseUrl;
      if (!baseUrl) {
        throw Error('invalide activityBase Url');
      }
      const apiUrl = `${baseUrl}/${ipAddress}`;
      try {
        const result = await this.utils.rerunnable(async () => {
          const apiRes = await firstValueFrom(
            this.http.get(apiUrl).pipe(timeout(this.REQUEST_TIMEOUT_MS)),
          );
          return apiRes.data;
        }, 3);

        if (result?.success) {
          isp = result.connection?.isp;
          city = result.city;
          state = result.region;
          country = result.country;

          await this.redis.client.setex(
            redisKey,
            this.CACHE_TTL,
            JSON.stringify(result),
          );
        }
      } catch (error) {
        this.alertService.notifyApiFailure({
          url: apiUrl,
          meta: {
            ip: ipAddress,
          },
          error: error.message,
        });
        this.logger.error(
          'Failed to fetch IP location details during login activity',
          error,
        );

        throw error;
      }
    }

    const result = await this.prisma.activityLog.create({
      data: {
        userId: options.userId,
        userType: options.userType,
        remark: options.remark || '',
        ipAddress,
        loginStatus: options.loginStatus,
        isp,
        city,
        state,
        country,
        device: options.device,
      },
    });
    this.logger.info('Login activity saved successfully');
    return {
      success: true,
      message: 'Activity log created successfully',
    };
  }

  // async loginActivity(options: {
  //   loginStatus: LoginStatus;
  //   ip?: string;
  //   userId?: bigint;
  //   userType?: UserType;
  //   remark?: string;
  // }) {
  //   let upline;
  //   if (
  //     options.loginStatus === LoginStatus.Success &&
  //     options.userType === UserType.User &&
  //     options.userId
  //   ) {
  //     upline = await this.usersService.getUplinePathById(options.userId);
  //   }

  //   if (!upline && options.userType === UserType.Admin) {
  //     upline = '0';
  //   }

  //   const ipAddress = this.normalizeIp(options.ip || '');

  //   let isp: string | undefined;
  //   let city: string | undefined;
  //   let state: string | undefined;
  //   let country: string | undefined;

  //   try {
  //     const apiUrl = `${this.activityConfig.activityBaseUrl}/${ipAddress}`;

  //     const result = await this.utils.rerunnable(async () => {
  //       const apiRes = await firstValueFrom(this.http.get(apiUrl));
  //       return apiRes.data;
  //     }, 3);

  //     if (result?.status === 'success') {
  //       isp = result.isp;
  //       city = result.city;
  //       state = result.regionName;
  //       country = result.country;
  //     }
  //   } catch (error) {
  //     this.logger.error(
  //       'Failed to fetch IP location details during login activity',
  //       error,
  //     );
  //   }

  //   await this.prisma.activityLog.create({
  //     data: {
  //       userId: options.userId,
  //       userType: options.userType,
  //       remark: options.remark || '',
  //       ipAddress,
  //       loginStatus: options.loginStatus,
  //       isp,
  //       city,
  //       state,
  //       country,
  //     },
  //   });
  //   this.logger.info('Login activity saved successfully');
  //   return {
  //     success: true,
  //     message: 'Activity log created successfully',
  //   };
  // }

  async getByUserId(
    userId: bigint,
    userType: UserType,
    options: DateFilterWithPaginationRequest,
    isExport?: boolean,
  ) {
    let take: number | undefined;
    let skip: number | undefined;

    if (!isExport) {
      take = options.limit ? Number(options.limit) : undefined;
      skip =
        options.page && options.limit
          ? (Number(options.page) - 1) * Number(options.limit)
          : undefined;
    }

    const where: Prisma.ActivityLogWhereInput = {
      userId,
      userType,
    };

    if (options.fromDate || options.toDate) {
      where.loginAt = {};
      if (options.fromDate) {
        where.loginAt.gte = new Date(options.fromDate);
      }
      if (options.toDate) {
        where.loginAt.lte = new Date(options.toDate);
      }
    }

    const totalItems = await this.prisma.activityLog.count({ where });
    // Fetch paginated results
    const logs = await this.prisma.activityLog.findMany({
      where,
      skip,
      take,
      orderBy: { loginAt: 'desc' },
      select: {
        id: true,
        remark: true,
        loginStatus: true,
        ipAddress: true,
        isp: true,
        city: true,
        state: true,
        country: true,
        device: true,
        loginAt: true,
      },
    });

    const totalPage = Math.ceil(
      totalItems / (take && take > 0 ? take : totalItems),
    );

    const pagination: Pagination = {
      totalItems,
      limit: take ?? totalItems,
      currentPage: options.page ?? 1,
      totalPage,
    };

    return {
      message: 'Activity logs fetched successfully.',
      pagination,
      data: logs,
    };
  }

  async exportActivityReports(
    userId: bigint,
    userType: UserType,
    query: activityLogDto,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.activity,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        timezone: query.timezone,
        name: query.fileName ?? 'Activity Log',
        filters: {
          userType,
          searchByUserId: query.searchByUserId,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
        },
      },
    });

    return {
      message: 'Your activity export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }
}
