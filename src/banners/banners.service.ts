import {
  BaseController,
  Pagination,
  StorageService,
  UtilsService,
} from '@Common';
import { bannerConfigFactory } from '@Config';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Banner, Prisma } from '@prisma/client';
import { join } from 'path';
import { PrismaService } from 'src/prisma';
import { BannerType, BannerPlatform } from '@prisma/client';
import { CreateBannerRequestDto, GetBannersRequestDto } from './dto';
@Injectable()
export class BannersService extends BaseController {
  constructor(
    @Inject(bannerConfigFactory.KEY)
    private readonly config: ConfigType<typeof bannerConfigFactory>,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    private readonly utilsService: UtilsService,
  ) {
    super({ loggerDefaultMeta: { service: BannersService.name } });
  }

  private getImageUrl(image: string): string {
    return this.storageService.getFileUrl(image, this.config.bannerImagePath);
  }

  async create(data: CreateBannerRequestDto): Promise<Banner> {
    return await this.prisma.$transaction(async (tx) => {
      await this.storageService.move(
        data.bannerImage,
        this.config.bannerImagePath,
      );
      const banner = await tx.banner.create({
        data: {
          image: data.bannerImage,
          name: data.name ?? null,
          heading: data.heading ?? null,
          description: data.description ?? null,
          size: data.size ?? null,
          type: data.type ?? BannerType.MainBanner,
          platform: data.platform ?? BannerPlatform.WebBanner,
        },
      });
      this.logger.info('Banner created successfully', { bannerId: banner.id });
      return {
        ...banner,
        image: this.getImageUrl(banner.image),
      };
    });
  }

  async updateBanner(
    bannerId: number,
    data: {
      name?: string;
      heading?: string;
      description?: string;
      size?: string;
      type?: BannerType;
      platform?: BannerPlatform;
      bannerImage?: string;
    },
  ): Promise<Banner> {
    return await this.prisma.$transaction(async (tx) => {
      const banner = await tx.banner.findUnique({
        where: { id: bannerId },
      });

      if (!banner) {
        this.logger.warn('Banner not found for update', { bannerId });
        throw new Error('Banner not found');
      }
      let updatedImage = banner.image;

      if (data.bannerImage) {
        await this.storageService.move(
          data.bannerImage,
          this.config.bannerImagePath,
        );

        updatedImage = data.bannerImage;
      }
      const updated = await tx.banner.update({
        where: { id: bannerId },
        data: {
          name: data.name ?? banner.name,
          heading: data.heading ?? banner.heading,
          description: data.description ?? banner.description,
          size: data.size ?? banner.size,
          type: data.type ?? banner.type,
          platform: data.platform ?? banner.platform,
          image: updatedImage,
        },
      });
      this.logger.info('Banner updated successfully', { bannerId });
      return {
        ...updated,
        image: this.getImageUrl(updated.image),
      };
    });
  }

  async delete(bannerId: number): Promise<{ status: string }> {
    const banner = await this.prisma.banner.findFirst({
      where: { id: bannerId },
    });
    if (!banner) {
      this.logger.warn('Banner not found for deletion', { bannerId });
      throw new Error('message.banner.bannerNotFound');
    }
    await this.prisma.banner.delete({
      where: { id: bannerId },
    });

    await this.storageService.removeFile(
      join(this.config.bannerImagePath, banner.image),
    );
    this.logger.info('Banner deleted successfully', { bannerId });

    return {
      status: 'success',
    };
  }

  async update(id: number): Promise<{ banner: Banner }> {
    return await this.prisma.$transaction(async (tx) => {
      const banner = await tx.banner.findFirst({
        where: {
          id,
        },
      });

      if (!banner) {
        this.logger.warn('Banner not found for publish toggle', {
          bannerId: id,
        });
        throw new Error('Banner not found');
      }
      const updatedBanner = await tx.banner.update({
        data: {
          isPubliced: !banner.isPubliced,
        },
        where: {
          id,
        },
      });

      return {
        banner: updatedBanner,
      };
    });
  }

  async getAll(options: GetBannersRequestDto) {
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
    const where: Prisma.BannerWhereInput = {};

    if (options.type) where.type = options.type;
    if (options.platform) where.platform = options.platform;

    const total = await this.prisma.banner.count({ where });
    const banners = await this.prisma.banner.findMany({
      where,
      orderBy: { id: Prisma.SortOrder.desc },
      skip,
      take,
    });

    const response = await this.utilsService.batchable(
      banners,
      async (banner) => ({
        ...banner,
        image: this.getImageUrl(banner.image),
      }),
    );

    const grouped: any = {};
    for (const banner of response) {
      const platform = banner.platform;
      const type = banner.type;

      if (!grouped[platform]) grouped[platform] = {};
      if (!grouped[platform][type]) grouped[platform][type] = [];

      grouped[platform][type].push(banner);
    }

    const totalPage = Math.ceil(
      total /
        (options.limit && options.limit > 0
          ? options.limit
          : total < 1
            ? 1
            : total),
    );

    const pagination: Pagination = {
      currentPage: options.page ?? 1,
      totalItems: total,
      totalPage,
      limit: options.limit ?? total,
    };

    return {
      data: response,
      pagination,
    };
  }

  async getAllPubliced(options?: GetBannersRequestDto): Promise<{
    count: number;

    data: Banner[];
  }> {
    const where: Prisma.BannerWhereInput = {
      isPubliced: true,
    };

    if (options?.type) where.type = options.type;
    if (options?.platform) where.platform = options.platform;

    const totalBanners = await this.prisma.banner.count({ where });
    const banners = await this.prisma.banner.findMany({
      where,
      orderBy: { id: Prisma.SortOrder.desc },
    });

    const response = await this.utilsService.batchable(
      banners,
      async (banner) => ({
        ...banner,
        image: this.getImageUrl(banner.image),
      }),
    );

    const grouped: any = {};
    for (const banner of response) {
      const platform = banner.platform;
      const type = banner.type;

      if (!grouped[platform]) grouped[platform] = {};
      if (!grouped[platform][type]) grouped[platform][type] = [];

      grouped[platform][type].push(banner);
    }
    this.logger.info('Published banners fetched successfully', {
      total: totalBanners,
    });

    return {
      count: totalBanners,
      data: grouped,
    };
  }
}
