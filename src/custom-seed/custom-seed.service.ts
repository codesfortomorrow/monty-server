import { Inject, Injectable } from '@nestjs/common';
import path from 'path';
import fs from 'fs';
import csv from 'csv-parser';
import { PrismaService } from 'src/prisma';
import { casinoConfigFactory } from '@Config';
import { ConfigType } from '@nestjs/config';
import { ProviderType, StatusType } from '@prisma/client';
import { UtilsService } from '@Common';

@Injectable()
export class CustomSeedService {
  constructor(
    @Inject(casinoConfigFactory.KEY)
    private readonly casinoConfig: ConfigType<typeof casinoConfigFactory>,
    private readonly prisma: PrismaService,
    private readonly utilsService: UtilsService,
  ) {}
  async seedCasinoGamesFromCSV() {
    const filePath = path.join(__dirname, '../../casino_games.csv');
    console.log(filePath, 'casino path');
    const casinoRows: any[] = [];

    // Parse CSV
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => casinoRows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    // await this.prisma.$transaction(async (tx) => {
    const provider = await this.prisma.provider.upsert({
      where: {
        name_providerType: {
          name: this.casinoConfig.casinoProvider ?? 'Gap',
          providerType: ProviderType.Casino,
        },
      },
      update: {},
      create: {
        name: this.casinoConfig.casinoProvider ?? 'Gap',
        providerType: ProviderType.Casino,
      },
    });
    if (!provider) throw new Error('Provider not found');

    await this.utilsService.batchable(casinoRows, async (row) => {
      const casinoProviderId = provider.id;
      const externalId = row.game_id;
      const name = row.title;
      const code = row.game_code;
      const gameProviderName = row.provider;
      const category = row.category;
      const gameImage = row.game_images;
      const status =
        row.status === 'ACTIVE' ? StatusType.Active : StatusType.Inactive;

      await this.prisma.casinoGame.upsert({
        where: {
          casinoProviderId_externalId: {
            casinoProviderId,
            externalId,
          },
        },
        update: {
          externalId,
          name,
          code,
          gameProviderName,
          category,
          gameImage,
          status,
        },
        create: {
          casinoProviderId,
          externalId,
          name,
          code,
          gameProviderName,
          category,
          gameImage,
          status,
        },
      });
    });
    // });

    console.log('✅ Seeded game from cv');
    return '✅ Seeded game from cv successfully!';
  }
}
