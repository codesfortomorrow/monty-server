import { PrismaClient, StatusType } from '@prisma/client';
import { sportConfigFactory } from '../../src/configs/sport.config';

const prisma = new PrismaClient();

const CASINO_ID = 3;

export async function seedSports() {
  // ROOT CATEGORY — cannot use upsert with parentId = null
  let sportsCategory = await prisma.gameCategory.findFirst({
    where: {
      name: 'SPORTS',
      type: 'TYPE',
      parentId: null,
    },
  });

  if (!sportsCategory) {
    sportsCategory = await prisma.gameCategory.create({
      data: {
        name: 'SPORTS',
        type: 'TYPE',
        parentId: null,
      },
    });
  }

  // Load sports config
  const sportConfig = sportConfigFactory();
  const sportsMap = sportConfig.sports;

  for (const [sportName, externalId] of Object.entries(sportsMap)) {
    await prisma.gameCategory.upsert({
      where: {
        externalId: Number(externalId),
      },
      update: {
        name: sportName,
        parentId: sportsCategory.id,
      },
      create: {
        name: sportName,
        type: 'GAME',
        parentId: sportsCategory.id,
        externalId: Number(externalId),
      },
    });
  }
}

export async function seedCasino() {
  const casino = await prisma.gameCategory.upsert({
    where: { externalId: CASINO_ID },
    update: {},
    create: {
      name: 'CASINO',
      type: 'TYPE',
      externalId: CASINO_ID,
      parentId: null,
    },
  });

  const casinoGames = await prisma.casinoGame.findMany({
    where: {
      status: StatusType.Active,
    },
  });

  for (const row of casinoGames) {
    const providerName = row.gameProviderName?.trim();
    const subProviderName = row.category?.trim();
    const gameName = row.name?.trim();
    const gameCode = row.code?.trim();
    const externalGameId = row.externalId;

    if (!providerName || !gameName) continue;

    // ───────── PROVIDER ─────────
    const provider = await prisma.gameCategory.upsert({
      where: {
        name_type_parentId: {
          name: providerName,
          type: 'PROVIDER',
          parentId: casino.id,
        },
      },
      update: {},
      create: {
        name: providerName,
        type: 'PROVIDER',
        parentId: casino.id,
      },
    });

    let parentId = provider.id;

    // ───────── SUB PROVIDER ─────────
    if (subProviderName) {
      const subProvider = await prisma.gameCategory.upsert({
        where: {
          name_type_parentId: {
            name: subProviderName,
            type: 'SUB_PROVIDER',
            parentId: provider.id,
          },
        },
        update: {},
        create: {
          name: subProviderName,
          type: 'SUB_PROVIDER',
          parentId: provider.id,
        },
      });

      parentId = subProvider.id;
    }

    // ───────── GAME ─────────
    const existingGame = await prisma.gameCategory.findFirst({
      where: {
        name: gameName,
        type: 'GAME',
        parentId,
      },
    });

    if (existingGame) {
      await prisma.gameCategory.update({
        where: { id: existingGame.id },
        data: {
          externalId: Number(externalGameId),
          metadata: {
            provider: providerName,
            subProvider: subProviderName,
            gameCode,
            casinoGameExternalId: externalGameId,
          },
        },
      });
    } else {
      await prisma.gameCategory.create({
        data: {
          name: gameName,
          type: 'GAME',
          parentId,
          externalId: Number(externalGameId),
          metadata: {
            provider: providerName,
            subProvider: subProviderName,
            gameCode,
            casinoGameExternalId: externalGameId,
          },
        },
      });
    }
  }
}
