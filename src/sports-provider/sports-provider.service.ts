import { sportConfigFactory } from '@Config';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from 'src/prisma';
import { CreateSportsProviderRequest } from './dto';
import { ProviderType } from '@prisma/client';

@Injectable()
export class SportsProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    @Inject(sportConfigFactory.KEY)
    private readonly sportConfig: ConfigType<typeof sportConfigFactory>,
  ) {}

  async insertProvider() {
    try {
      const apiUrl = `${this.sportConfig.sportBaseUrl}/provider`;
      const { data } = await firstValueFrom(this.httpService.get(apiUrl));

      if (data && !Array.isArray(data)) {
        throw new Error('3rd-party response must be an array');
      }

      const upserted: any[] = [];

      for (const provider of data) {
        if (!provider.name) continue;

        const record = await this.prisma.provider.upsert({
          where: {
            name_providerType: {
              name: provider.name,
              providerType: ProviderType.Sports,
            },
          },
          update: { externalId: `${provider.id}` }, // no update needed yet, can extend later
          create: {
            name: provider.name,
            providerType: ProviderType.Sports,
            externalId: `${provider.id}`,
          },
        });

        upserted.push(record);
      }

      return {
        success: true,
        message: 'Providers synced successfully',
        count: upserted.length,
        upserted,
      };
    } catch (error) {
      throw new Error(
        `Failed to sync providers: ${error?.message || 'Unknown error'}`,
      );
    }
  }

  async create(dto: CreateSportsProviderRequest) {
    return this.prisma.provider.upsert({
      where: {
        name_providerType: {
          name: dto.name,
          providerType: ProviderType.Sports,
        },
      },
      update: {}, // skip update for now
      create: { name: dto.name, providerType: ProviderType.Sports },
    });
  }

  async findAll() {
    return this.prisma.provider.findMany({
      where: { providerType: ProviderType.Sports },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: number) {
    const provider = await this.prisma.provider.findUnique({
      where: { id },
    });
    if (!provider) throw new Error('Provider not found');

    return this.prisma.provider.delete({ where: { id } });
  }
}
