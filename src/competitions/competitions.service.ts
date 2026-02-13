import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { RedisService } from 'src/redis';
import { CompetitionRequest } from './dto';
import { Prisma, StatusType } from '@prisma/client';
import { BaseService } from '@Common';

@Injectable()
export class CompetitionsService extends BaseService {
  private readonly CACHE_TTL = 60 * 5; // 5 minutes
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super({ loggerDefaultMeta: { service: CompetitionsService.name } });
  }

  async getCompetitions(query: CompetitionRequest) {
    const redisKey = `competitions:${query.sport || 'all'}:${query.search || 'null'}`;
    const data = await this.redis.client.get(redisKey);
    if (data) {
      return JSON.parse(data);
    }

    const where: Prisma.CompetitionWhereInput = {
      events: {
        some: {
          status: {
            in: [
              StatusType.Active,
              StatusType.Live,
              StatusType.Upcoming,
              StatusType.Open,
            ],
          },
          markets: {
            some: {
              status: { notIn: [StatusType.Inactive, StatusType.Closed] },
            },
          },
        },
      },
      deletedAt: null,
    };

    if (query.sport) where.sport = query.sport;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    console.log('Where in competition', where);
    // ✅ Fetch from DB
    const competitions = await this.prisma.competition.findMany({
      where,
      omit: { deletedAt: true },
    });

    // ✅ Store in cache
    await this.redis.client.setex(
      redisKey,
      this.CACHE_TTL,
      JSON.stringify(competitions),
    );

    return competitions;
  }
}
