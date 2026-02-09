import { Command } from 'commander';
import {
  PrismaClient,
  WalletTransactionContext,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import { isEmail } from 'class-validator';
import {
  admin,
  mainnetNetworks,
  seedBetConfig,
  seedCasino,
  seedCurrency,
  seedPrivilegesAndOwnerRole,
  seedSports,
  settings,
} from './seeds';
import {
  createMostPlayedCasinoGamesView,
  createUserWeeklySummaryView,
} from './views';
import { AppConfig, appConfigFactory } from '../src/configs/app.config';
import { currencyConfigFactory } from '../src/configs/currency.config';

const program = new Command();
program.option('--seed-only <name>', 'Specify a seed name').parse(process.argv);

const prisma = new PrismaClient();

async function main() {
  const options = program.opts();

  // Create materialized view (first-time setup)
  if (!options.seedOnly || options.seedOnly === 'views') {
    await createMostPlayedCasinoGamesView();
    await createUserWeeklySummaryView();
  }

  // Seed roles and privileges
  if (!options.seedOnly || options.seedOnly === 'roles') {
    await seedPrivilegesAndOwnerRole();
  }

  if (!options.seedOnly || options.seedOnly === 'network') {
    if (await prisma.network.count()) {
      console.log('⚠ Skipping seed for `network`, due to non-empty table');
    } else {
      const networks = mainnetNetworks;
      for (const network of networks) {
        await prisma.network.create({
          data: network,
        });
      }
    }
  }

  // Seed default bet config
  if (!options.seedOnly || options.seedOnly === 'betconfigs') {
    await seedBetConfig();
  }

  // Seed default currency
  if (!options.seedOnly || options.seedOnly === 'currency') {
    if (await prisma.currency.count()) {
      console.log('⚠ Skipping seed for `currency`, due to non-empty table');
    } else {
      await seedCurrency();
    }
  }

  // Seed all settings
  if (!options.seedOnly || options.seedOnly === 'setting') {
    if (await prisma.setting.count()) {
      console.log('⚠ Skipping seed for `setting`, due to non-empty table');
    } else {
      await prisma.setting.createMany({
        data: settings,
      });
      console.log(
        `Seeded setting table successfully (${settings.length} records)`,
      );
    }
  }

  // Seed admin default credential
  if (!options.seedOnly || options.seedOnly === 'admin') {
    if (await prisma.admin.count()) {
      console.log('⚠ Skipping seed for `admin`, due to non-empty table');
    } else {
      const appConfig = appConfigFactory() as unknown as AppConfig;

      const rolesConfig = appConfig.userTypes;
      const owenerRole = Object.keys(rolesConfig).find(
        (role) => rolesConfig[role].level === 1,
      );
      if (!owenerRole)
        throw new Error('In config must have a role with level 1');

      const role = await prisma.role.upsert({
        where: { name: owenerRole },
        update: {},
        create: {
          name: owenerRole,
          description: rolesConfig?.[owenerRole]?.description,
          level: rolesConfig?.[owenerRole]?.level,
          isEditable: false,
        },
      });

      if (
        isEmail(admin.email) &&
        admin.meta?.create?.passwordHash &&
        admin.meta.create.passwordSalt
      ) {
        try {
          await prisma.$transaction(async (tx) => {
            const adminDetails = await tx.admin.create({
              data: { ...admin, role: { connect: { id: role.id } } },
            });
            const currencyConfig = currencyConfigFactory();
            const currencyCode = currencyConfig.currencyCode;
            if (!currencyCode)
              throw new Error('Default Currency Code is missing');
            const currency = await tx.currency.findUnique({
              where: { code: currencyCode },
            });
            if (!currency) throw new Error('Currency not found');
            const wallet = await tx.wallet.create({
              data: {
                type: WalletType.Main,
                userId: null,
                adminId: adminDetails.id,
                currencyId: currency.id,
              },
            });
            const updatedWallet = await tx.wallet.update({
              data: {
                amount: 1000000000,
              },
              where: {
                id: wallet.id,
              },
            });

            await tx.walletTransactions.create({
              data: {
                context: WalletTransactionContext.SystemDeposit,
                walletId: wallet.id,
                type: WalletTransactionType.Credit,
                amount: 10000000,
                availableBalance: updatedWallet.amount,
                currencyId: currency.id,
                nonce: updatedWallet.version,
                timestamp: updatedWallet.updatedAt,
              },
            });
          });
        } catch (error) {
          throw error;
        }
      } else {
        console.error(new Error('Invalid default admin credentials found'));
      }
    }
  }

  if (!options.seedOnly || options.seedOnly === 'game-categories') {
    console.log('Seeding game categories...');
    await seedSports();
    await seedCasino();
    console.log('Game categories seeding completed.');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
