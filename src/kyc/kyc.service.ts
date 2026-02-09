import { BaseService, Pagination } from '@Common';
import { Injectable } from '@nestjs/common';
import { KycStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma';
import { UpdateKycStatusDto } from './dto/update-kyc-status.request';
import { CreateKycDto, GetKycDto } from './dto';

@Injectable()
export class KycService extends BaseService {
  constructor(private readonly prisma: PrismaService) {
    super({ loggerDefaultMeta: { service: KycService.name } });
  }

  async submitKyc(userId: bigint, dto: CreateKycDto) {
    const existing = await this.prisma.kyc.findUnique({
      where: { userId },
    });
    if (existing) {
      throw new Error('KYC already submitted ');
    }
    return this.prisma.kyc.create({
      data: {
        userId,
        cardNumber: dto.cardNumber,
        frontImage: dto.frontImage,
        backImage: dto.backImage,
      },
    });
  }

  async updateStatus(id: bigint, dto: UpdateKycStatusDto) {
    const kyc = await this.prisma.kyc.findUnique({
      where: { id },
    });

    if (!kyc) {
      throw new Error('KYC not found.');
    }

    return this.prisma.kyc.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async getUserKyc(userId: bigint) {
    const kyc = await this.prisma.kyc.findUnique({
      where: { userId },
    });

    if (!kyc) {
      throw new Error('You have not submitted your KYC yet.');
    }

    return kyc;
  }

  async getAllKyc(options: GetKycDto) {
    let take: number | undefined;
    let skip: number | undefined;

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

    const where: Prisma.KycWhereInput = {};

    if (options.search) {
      const s = options.search;
      where.OR = [
        { cardNumber: { contains: s, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { firstname: { contains: s, mode: 'insensitive' } },
              { lastname: { contains: s, mode: 'insensitive' } },
              { username: { contains: s, mode: 'insensitive' } },
              { email: { contains: s, mode: 'insensitive' } },
              { mobile: { contains: s, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    if (options.status) {
      where.status = options.status;
    }

    if (options.fromDate || options.toDate) {
      where.createdAt = {};

      if (options.fromDate) {
        where.createdAt.gte = new Date(options.fromDate);
      }
      if (options.toDate) {
        where.createdAt.lte = new Date(options.toDate);
      }
    }

    const total = await this.prisma.kyc.count({ where });

    const kycs = await this.prisma.kyc.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            username: true,
            mobile: true,
          },
        },
      },
      orderBy: {
        id: 'desc',
      },
      skip,
      take,
    });

    const totalPage = Math.ceil(
      total /
        (options.limit && options.limit > 0
          ? options.limit
          : total < 1
            ? 1
            : total),
    );

    const pagination: Pagination = {
      totalItems: total,
      limit: take ?? total,
      currentPage: options.page ?? 1,
      totalPage,
    };

    return {
      message: 'KYC list fetched successfully.',
      data: kycs,
      pagination,
    };
  }

  async updateKycDetail(
    userId: bigint,
    dto: {
      cardNumber?: string;
      frontImage?: string;
      backImage?: string;
    },
  ) {
    const kyc = await this.prisma.kyc.findUnique({
      where: { userId },
    });

    if (!kyc) {
      throw new Error('KYC not found.');
    }

    if (kyc.status === KycStatus.Approved) {
      throw new Error('KYC is already approved. You cannot update details.');
    }

    return this.prisma.kyc.update({
      where: { userId },
      data: {
        cardNumber: dto.cardNumber ?? kyc.cardNumber,
        frontImage: dto.frontImage ?? kyc.frontImage,
        backImage: dto.backImage ?? kyc.backImage,
      },
    });
  }

  async deleteKyc(userId: bigint) {
    const kyc = await this.prisma.kyc.findUnique({
      where: { userId },
    });

    if (!kyc) {
      throw new Error('KYC record not found.');
    }

    await this.prisma.kyc.delete({
      where: { userId },
    });

    return { message: 'KYC deleted successfully.' };
  }

  async deleteKycById(id: bigint) {
    const kyc = await this.prisma.kyc.findUnique({
      where: { id },
    });

    if (!kyc) {
      throw new Error('KYC record not found.');
    }

    await this.prisma.kyc.delete({
      where: { id },
    });

    return { message: 'KYC deleted successfully.' };
  }
}
