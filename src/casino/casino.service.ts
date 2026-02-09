import { BaseService, Pagination, UserType } from '@Common';
import {
  casinoConfigFactory,
  casinoGamesConfigFactory,
  currencyConfigFactory,
} from '@Config';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  BetStatusType,
  ExportFormat,
  ExportType,
  Prisma,
  ProviderType,
  StatusType,
  UserStatus,
  WalletTransactionContext,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import axios, { AxiosResponse } from 'axios';
import { PrismaService } from 'src/prisma';
import { WalletsService } from 'src/wallets/wallets.service';
import {
  CasinoHistoryExportRequest,
  CasinoHistoryRequest,
  CasinoProfitLossRequest,
  exportCasinoGamesPayload,
  GetCasinoGamesPayload,
  UpdateCasinoGame,
} from './dto';
import { FinalGames } from './casino.type';
import { getStatusEnum } from 'src/utils/sports';
import { UsersService } from 'src/users';
import { SportsPermissionService } from 'src/sports-permission/sports-permission.service';
import { TurnoverService } from 'src/turnover/turnover.service';
import { CASINO_CATEGORIES } from './casino.utils';

@Injectable()
export class CasinoService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletsService,
    private readonly userService: UsersService,
    private readonly sportsPermissionService: SportsPermissionService,
    private readonly turnoverService: TurnoverService,
    @Inject(currencyConfigFactory.KEY)
    private readonly currencyConfig: ConfigType<typeof currencyConfigFactory>,
    @Inject(casinoConfigFactory.KEY)
    private readonly casinoConfig: ConfigType<typeof casinoConfigFactory>,
    @Inject(casinoGamesConfigFactory.KEY)
    private readonly casinoGamesConfig: ConfigType<
      typeof casinoGamesConfigFactory
    >,
  ) {
    super({ loggerDefaultMeta: { service: CasinoService.name } });
  }

  async transaction(data: {
    txnType: 'DEBIT' | 'CREDIT' | 'COMPLETE LOSS';
    txnId: string;
    userId: string;
    roundId: string;
    amount: number;
    // currency: string;
    gameId: number;
    // created: string;
    completed: boolean;
    gameName: string;
    // walletSessionId: string;
    context: WalletTransactionContext;
    prismaTransaction: Prisma.TransactionClient;
  }) {
    this.logger.info('🎰 Starting casino transaction');

    const userId = Number(data.userId);
    const completed = Boolean(data.completed);
    const tx = data.prismaTransaction;

    try {
      // return await this.prisma.$transaction(async (tx) => {
      // 🧑 Fetch User and Wallet
      const user = await this.userService.getById(userId);

      const wallet = await this.walletService.getByUserId(
        userId,
        WalletType.Main,
        { tx },
      );

      if (!user || !wallet) {
        throw new Error('The player account is blocked.');
      }

      // 🎯 Fetch existing round or create new one
      let roundHistory = await tx.casinoRoundHistory.findUnique({
        where: { roundId: data.roundId },
      });

      if (!roundHistory) {
        roundHistory = await tx.casinoRoundHistory.create({
          data: {
            roundId: data.roundId,
            txnId: data.txnId,
            userId,
            gameId: data.gameId,
            gameName: data.gameName,
            totalBets: 0,
            totalWins: 0,
            completed: false,
            status: BetStatusType.Pending,
          },
        });
      }

      // 🧾 Transaction logic (DEBIT / CREDIT / COMPLETE LOSS)
      if (data.txnType === 'DEBIT') {
        // 🧮 Update total bets
        const result = await tx.casinoRoundHistory.update({
          where: { roundId: data.roundId },
          data: {
            totalBets: { increment: Number(data.amount) },
            completed,
            status: completed ? BetStatusType.Lost : BetStatusType.Pending,
          },
        });
      } else if (data.txnType === 'CREDIT' && data.amount >= 0) {
        const status =
          Number(roundHistory.totalWins) + data.amount >
          Number(roundHistory.totalBets)
            ? BetStatusType.Won
            : BetStatusType.Lost;
        // 🧮 Update total wins
        await tx.casinoRoundHistory.update({
          where: { roundId: data.roundId },
          data: {
            totalWins: { increment: Number(data.amount) },
            status,
            completed,
            isPlCalculated: false,
          },
        });

        this.logger.info('✅ CREDIT transaction recorded');
      } else if (completed) {
        // ⚠️ Handle completed but no credit (loss case)
        const hasCredit = await tx.casinoTransaction.findFirst({
          where: {
            providerRoundId: data.roundId,
            type: WalletTransactionType.Credit,
          },
        });

        if (!hasCredit) {
          await tx.casinoRoundHistory.update({
            where: { roundId: data.roundId },
            data: { status: BetStatusType.Lost, completed: true },
          });
          this.logger.info('⚠️ Marked round as loss');
        }
      }

      return { success: true };
    } catch (error) {
      this.logger.error('❌ Prisma transaction error:', error);
      throw error;
    }
  }

  async insertCasinoGames() {
    try {
      const url = `https://api.insoftdemo.site/sessions/all/games`;
      const response = await axios.get(url);
      const casinoGameList = response.data;

      if (
        !casinoGameList ||
        casinoGameList.status !== 'SUCCESS' ||
        !Array.isArray(casinoGameList.data)
      ) {
        throw new Error('No Casino Games Found');
      }

      const allGames = casinoGameList.data;

      // Get casino games config
      const casinoGamesConfig = this.casinoGamesConfig;
      const allowedProviders = Object.keys(casinoGamesConfig);

      const games = allGames.filter(
        (game: { subProvider?: string; provider?: string }) => {
          const providerName = game.subProvider || game.provider;
          return allowedProviders.includes(providerName!);
        },
      );

      console.log(
        `Filtered ${games.length} games from ${allGames.length} total games`,
      );

      // Get or create the main casino provider
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

      let successCount = 0;
      let skipCount = 0;

      for (const casinoGame of games) {
        try {
          const casinoGamesConfig = this.casinoGamesConfig as Record<
            string,
            string
          >;

          const gameProviderName =
            casinoGame.subProvider || casinoGame.provider;
          const mappedProviderName = casinoGamesConfig[gameProviderName];

          if (!mappedProviderName) {
            skipCount++;
            continue;
          }

          await this.prisma.casinoGame.upsert({
            where: {
              casinoProviderId_externalId: {
                casinoProviderId: provider.id,
                externalId: `${casinoGame.id}`,
              },
            },
            update: {
              name: casinoGame.name,
              code: casinoGame.gameCode,
              gameImage: casinoGame.urlThumb,
              category: casinoGame.category,
              status:
                casinoGame.status === 'ACTIVE'
                  ? StatusType.Active
                  : StatusType.Inactive,
              gameProviderName: gameProviderName,
            },
            create: {
              externalId: `${casinoGame.id}`,
              name: casinoGame.name,
              code: casinoGame.gameCode,
              category: casinoGame.category,
              gameImage: casinoGame.urlThumb,
              status:
                casinoGame.status === 'ACTIVE'
                  ? StatusType.Active
                  : StatusType.Inactive,
              gameProviderName: gameProviderName,
              casinoProviderId: provider.id,
            },
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to sync game ${casinoGame.id}:`, error.message);
          skipCount++;
        }
      }

      return {
        success: true,
        total: successCount,
        skipped: skipCount,
        filtered: allGames.length - games.length,
        message: `Casino games synced successfully. ${successCount} synced, ${skipCount} skipped, ${allGames.length - games.length} filtered out`,
      };
    } catch (error) {
      console.log('Error to sync casino games', error.message);
      return {
        success: false,
        total: 0,
        message: `Casino games sync failed: ${error.message}`,
      };
    }
  }

  async liveCasinoGames(query: GetCasinoGamesPayload, isExport?: boolean) {
    // Base filter
    const where: Prisma.CasinoGameWhereInput = {};

    // Clean inputs
    const cleanSearch = query.search;
    const cleanCategory = query.category;
    const cleanProvider = query.provider;

    // Build OR conditions
    const orConditions: Prisma.CasinoGameWhereInput[] = [];

    if (cleanSearch) {
      orConditions.push({
        name: { contains: cleanSearch, mode: 'insensitive' },
      });
    }

    // if (cleanCategory) {
    //   orConditions.push(
    //     { category: { contains: cleanCategory, mode: 'insensitive' } },
    //     { name: { contains: cleanCategory, mode: 'insensitive' } },
    //   );
    // }

    if (cleanCategory) {
      const pluralCategory = cleanCategory.endsWith('s')
        ? cleanCategory
        : `${cleanCategory}s`;
      orConditions.push(
        { category: { contains: cleanCategory, mode: 'insensitive' } },
        { category: { contains: pluralCategory, mode: 'insensitive' } },
        //{ name: { contains: cleanCategory, mode: 'insensitive' } },
      );
    }
    console.log(orConditions, 'andar bahar');

    if (cleanProvider) {
      // For provider filter — assuming sub_provider is stored as providerName or linked model
      where.gameProviderName = { contains: cleanProvider, mode: 'insensitive' };
    }
    if (cleanProvider) {
      orConditions.concat(this.resolveProviderSearch(cleanProvider));
    }

    if (orConditions.length > 0) {
      where.OR = orConditions;
    }

    if (query.status) {
      where.status =
        query.status === 'ALL' ? undefined : getStatusEnum(query.status);
    }

    // Pagination defaults
    let take = undefined,
      skip = undefined;
    if (
      !isExport &&
      query.page &&
      query.limit &&
      !isNaN(query.limit) &&
      !isNaN(query.page)
    ) {
      query.page = query.page < 1 ? 1 : query.page;
      take = query.limit;
      skip = (query.page - 1) * query.limit;
    }

    // Fetch games + total count
    let finalGames: FinalGames[];
    if (query.userId) {
      const games = await this.prisma.casinoGame.findMany({
        where,
        orderBy: { id: 'asc' },
        include: {
          favoriteGames: {
            where: {
              userId: query.userId,
            },
            select: { id: true },
          },
        },
        skip: isExport ? undefined : skip,
        take: isExport ? undefined : take,
      });
      // Attach isFavorite
      finalGames = games.map((g) => ({
        ...g,
        isFavorite: query.userId ? g.favoriteGames.length > 0 : false,
      }));
    } else {
      const games = await this.prisma.casinoGame.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: isExport ? undefined : skip,
        take: isExport ? undefined : take,
      });
      // Attach isFavorite
      finalGames = games.map((g) => ({
        ...g,
        isFavorite: false,
      }));
    }
    const total = await this.prisma.casinoGame.count({ where });

    if (isExport) {
      return {
        data: finalGames,
        totalItems: total,
      };
    }

    const totalPage = Math.ceil(
      total /
        (query.limit && query.limit > 0 ? query.limit : total < 1 ? 1 : total),
    );

    return {
      games: finalGames,
      pagination: {
        total,
        limit: take ?? total,
        currentPage: query.page ?? 1,
        totalPage,
      },
    };
  }

  private providerVariants: Record<string, string[]> = {
    'Royal Gaming': [
      'Royal Gaming',
      'Royal Gaming Lobby',
      'Royal Gaming Virtual',
    ],
    'Turbo Games': ['TURBO', 'Turbogames', 'Turbo Games'],
    'Yuvi Games': ['Yuvi Games', 'Yuvi Games Lobby'],
    'Vivo Gaming': ['Vivo Gaming', 'VivoGaming'],
    TVBet: ['Tvbet', 'TVBet'],
    Spribe: ['SPRIBE'],
    BetGames: ['BETGAMES', 'BetGames'],
    Ezugi: ['EZUGI', 'Ezugi'],
    Crash88: ['CRASH88', 'CRASH88 Gaming', 'Mini Crash'],
    Creed: ['CREED', 'Creedroomz', 'Popok'],
    JiLi: ['JILI', 'JiLi Gaming'],
    Kingmidas: ['KINGMIDAS', 'Kingmidas Gaming'],
    Mac88: [
      'MAC88',
      'Mac88 Gaming',
      'Mac88 Gaming Virtual',
      'MAC88 Lite',
      'MAC Excite',
    ],
    'Aviator Studio': ['Aviator Studio', 'Aviator Studio Gaming'],
    Macaw: ['MACAW', 'Macaw Gaming'],
    Marbles: ['MARBLES', 'Marbles'],
    'Pragmatic Play': [
      'Pragmatic Play',
      'Pragmatic Play 2',
      'Pragmatic Play Live',
    ],
    Suno: ['SUNO', 'SuperNowa'],
    Playtech: ['Playtech', 'Playtech Live'],
    'PG Soft': ['PG', 'PGSoft'],
  };

  private resolveProviderSearch(
    provider: string,
  ): Prisma.CasinoGameWhereInput[] {
    const key = provider.toUpperCase().replace(/[_\s]+/g, '');
    for (const variants of Object.values(this.providerVariants)) {
      if (
        variants.some((v) => v.toUpperCase().replace(/[_\s]+/g, '') === key)
      ) {
        return variants.map((v) => ({
          gameProviderName: {
            contains: v,
            mode: 'insensitive',
          },
        }));
      }
    }
    // fallback → simple case-insensitive search
    return [
      {
        gameProviderName: {
          contains: provider,
          mode: 'insensitive',
        },
      },
    ];
  }

  // async casinoGameCategory(search?: string, provider?: string) {
  //   // Base filter
  //   const where: Prisma.CasinoGameWhereInput = {
  //     status: StatusType.Active,
  //   };

  //   // Clean inputs
  //   const cleanSearch = search?.replace(/_/g, ' ');
  //   const cleanProvider = provider?.replace(/_/g, ' ');

  //   // OR filters
  //   const orConditions: Prisma.CasinoGameWhereInput[] = [];

  //   if (cleanSearch) {
  //     orConditions.push({
  //       name: { contains: cleanSearch, mode: 'insensitive' },
  //     });
  //   }

  //   // if (cleanCategory) {
  //   //   orConditions.push(
  //   //     { category: { contains: cleanCategory, mode: 'insensitive' } },
  //   //     { name: { contains: cleanCategory, mode: 'insensitive' } }
  //   //   );
  //   // }

  //   if (orConditions.length > 0) {
  //     where.OR = orConditions;
  //   }

  //   if (cleanProvider) {
  //     where.gameProviderName = { contains: cleanProvider, mode: 'insensitive' };
  //   }

  //   // ✅ Fetch distinct categories
  //   const categories = await this.prisma.casinoGame.findMany({
  //     where,
  //     distinct: ['category'],
  //     select: { category: true },
  //     orderBy: { category: 'asc' },
  //   });

  //   const games = categories
  //     .map((c) => c.category)
  //     .filter((c): c is string => !!c); // remove nulls if any

  //   return {
  //     games,
  //     total: games.length,
  //   };
  // }

  // async casinoGameCategory(search?: string, provider?: string) {
  //   const cleanSearch = search;
  //   const cleanProvider = provider;

  //   const categories = await this.prisma.$queryRaw<{ category: string }[]>`
  //   SELECT
  //     MIN(category) AS category
  //   FROM "casino_game"
  //   WHERE status = 'active'
  //     ${
  //       cleanSearch
  //         ? Prisma.sql`AND category ILIKE ${'%' + cleanSearch + '%'}`
  //         : Prisma.empty
  //     }
  //     ${
  //       cleanProvider
  //         ? Prisma.sql`AND "gameProviderName" ILIKE ${'%' + cleanProvider + '%'}`
  //         : Prisma.empty
  //     }
  //     GROUP BY
  //       REPLACE(
  //         REGEXP_REPLACE(
  //           LOWER(TRIM(category)),
  //           's$',
  //           ''
  //         ),
  //         ' ',
  //         ''
  //       )
  //     ORDER BY category ASC
  //   `;

  //   const games = categories.map((c) => c.category);

  //   return {
  //     games,
  //     total: games.length,
  //   };
  // }

  async casinoGameCategory(search?: string, provider?: string) {
    const categories = await this.prisma.$queryRaw<{ category: string }[]>`
    SELECT
      MIN(category) AS category
    FROM "casino_game"
    WHERE 1 = 1
      ${
        search
          ? Prisma.sql`AND category ILIKE ${'%' + search + '%'}`
          : Prisma.empty
      }
      ${
        provider
          ? Prisma.sql`AND "gameProviderName" ILIKE ${'%' + provider + '%'}`
          : Prisma.empty
      }
    GROUP BY
      REPLACE(
        REGEXP_REPLACE(
          LOWER(TRIM(category)),
          's$',
          ''
        ),
        ' ',
        ''
      )
    ORDER BY category ASC
  `;

    const games = categories.map((c) => c.category);

    return {
      games,
      total: games.length,
    };
  }

  async createCasinoSession(
    platformtype: 'Mobile' | 'Desktop',
    gameId: number,
    userId: bigint,
    ip: string,
  ) {
    const platform = platformtype === 'Mobile' ? 'Mobile' : 'Desktop';

    // Fetch user with minimal fields
    const user = await this.userService.getById(userId);

    // Fetch wallet
    const wallet = await this.walletService.getByUserId(
      userId,
      WalletType.Main,
    );

    if (!user || !wallet) {
      return {
        success: false,
        status: 'ACCOUNT_BLOCKED',
        message: 'The player account is blocked.',
      };
    }

    if (user.status !== UserStatus.Active)
      throw new Error('Your account is blocked');

    const isAllowed = await this.sportsPermissionService.checkPermission(
      user.id,
      'Casino',
    );

    if (!isAllowed)
      throw new Error('You do not have permission to access the casino.');

    // Calculate updated balance
    const exposureAmount = 0; // if you have separate exposure model, fetch it here

    const updatedBalance = Math.round(
      Number(wallet.amount) -
        Math.abs(exposureAmount) -
        Math.abs(Number(wallet.lockedAmount)),
    );

    // Fetch casino game
    const casino = await this.prisma.casinoGame.findUnique({
      where: { id: gameId },
      select: { gameProviderName: true, externalId: true },
    });

    if (!casino) {
      throw new Error('Casino game not found');
    }

    // Payload for GAP API
    const payload = {
      operatorId: this.casinoConfig.operatorId,
      providerName: casino.gameProviderName,
      gameId: casino.externalId,
      userId: user.id.toString(),
      username: user.username,
      platformId: this.casinoConfig.operatorId,
      lobby: false,
      platform,
      clientIp: ip,
      currency: this.currencyConfig.currencyCode ?? 'BDT',
      balance: updatedBalance,
      redirectUrl: this.casinoConfig.redirectUrl,
    };

    this.logger.debug('Gap casino session payload', payload);

    // Make external API call
    const url = `${this.casinoConfig.gapBaseUrl}/sessions`;

    let response: AxiosResponse;
    try {
      response = await axios.post(url, payload);
      this.logger.debug('Response', response.data);

      // Update casino token
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          meta: {
            update: {
              casinoToken: response.data.token,
            },
          },
        },
      });

      // Add to recent played games
      await this.addToRecentGames(gameId, userId);

      return {
        success: true,
        status: 'OK',
        message: 'ok',
        url: response.data.url,
      };
    } catch (error) {
      this.logger.error(`Error to create casino session: ${error.message}`);
      return {
        success: false,
        message: error.message || 'Internal Server Error',
      };
    }
  }

  async casinoBalance(userId: number) {
    const userMetaDetails = await this.prisma.userMeta.findUnique({
      where: { userId },
    });

    if (!userMetaDetails) {
      throw new Error('User not found');
    }

    if (!userMetaDetails.casinoToken) {
      throw new Error('Token not found');
    }
    const userWallet = await this.walletService.getByUserId(
      userId,
      WalletType.Main,
    );

    if (!userWallet) {
      return {
        success: false,
        status: 'OP_GENERAL_ERROR',
      };
    }

    let updatedBalance = 0;
    updatedBalance = Math.round(
      Number(userWallet.amount) -
        Math.abs(Number(userWallet.exposureAmount)) -
        Math.abs(Number(userWallet.lockedAmount)),
    );

    return { success: true, updatedBalance, status: 'OP_SUCCESS' };
  }

  async handleDebitCallback(
    userId: bigint,
    reqId: string,
    transactionId: string,
    gameId: string,
    roundId: string,
    debitAmount: number,
  ) {
    const userDetails = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        meta: true,
      },
    });
    if (!userDetails) {
      throw new Error('User not found');
    }
    // if (userDetails.get('user_type') !== 'USER') {
    //   return res.status(400).json({
    //     status: 'OP_USER_BLOCKED',
    //   });
    // }

    if (!userDetails.meta?.casinoToken) {
      throw new Error('Token not found');
    }

    if (debitAmount < 0) {
      return { success: false, status: 'OP_ERROR_NEGATIVE_DEBIT_AMOUNT' };
    }

    try {
      // 3️⃣ Fetch Casino Game
      const casinoGame = await this.prisma.casinoGame.findFirst({
        where: { externalId: gameId },
      });
      if (!casinoGame) throw new Error('OP_INVALID_GAME');

      // 4️⃣ Prevent duplicate transaction
      const existingTxn = await this.prisma.casinoTransaction.findFirst({
        where: {
          providerTransactionId: transactionId,
          providerRoundId: roundId,
          gameId: casinoGame.id,
        },
      });
      if (existingTxn) throw new Error('OP_DUPLICATE_TRANSACTION');

      return await this.prisma.$transaction(async (tx) => {
        // 1️⃣ Fetch wallet
        const userWallet = await this.walletService.getByUserId(
          userId,
          WalletType.Main,
          { tx },
        );
        if (!userWallet) throw new Error('OP_GENERAL_ERROR');

        // 2️⃣ Compute available balance
        const userBalance =
          Number(userWallet.amount) -
          Math.abs(Number(userWallet.exposureAmount)) -
          Number(Number(userWallet.lockedAmount));

        if (userBalance < debitAmount) throw new Error('OP_INSUFFICIENT_FUNDS');

        // 5️⃣ Subtract from wallet
        const updatedWallet = await this.walletService.subtractBalance(
          userId,
          new Decimal(debitAmount),
          WalletType.Main,
          true,
          {
            tx,
            context: WalletTransactionContext.CasinoBet,
            narration: `Bet placed: ${casinoGame.name}/${roundId}`,
          },
        );

        if (!updatedWallet) throw new Error('OP_GENERAL_ERROR');

        // 6️⃣ Compute updated user balance
        const updatedUserBalance =
          Number(updatedWallet.amount) -
          Math.abs(Number(updatedWallet.exposureAmount)) -
          Number(updatedWallet.lockedAmount);

        // // 7️⃣ Record transaction history
        await this.transaction({
          txnType: 'DEBIT',
          txnId: transactionId,
          userId: String(userId),
          roundId,
          amount: debitAmount,
          gameId: casinoGame.id,
          completed: false,
          gameName: casinoGame.name,
          context: WalletTransactionContext.CasinoBet,
          prismaTransaction: tx,
        });

        // 8️⃣ Record casino transaction
        await tx.casinoTransaction.create({
          data: {
            gameId: casinoGame.id,
            userId: userId,
            providerTransactionId: transactionId,
            providerRoundId: roundId,
            amount: debitAmount,
            debitTxnId: reqId,
            type: WalletTransactionType.Debit,
            gameCode: casinoGame.code,
            providerCode: casinoGame.gameProviderName,
            gameName: casinoGame.name,
            status: BetStatusType.Pending,
          },
        });

        return {
          success: true,
          balance: updatedUserBalance,
          status: 'OP_SUCCESS',
        };
      });
    } catch (error: any) {
      if (error.message?.startsWith('OP_')) {
        return { success: false, status: error.message };
      }
      this.logger.error('Debit callback error:', error);
      return { success: false, message: error.message || 'OP_GENERAL_ERROR' };
    }
  }

  async handleCreditCallback(
    userId: bigint,
    reqId: string,
    transactionId: string,
    gameId: string,
    roundId: string,
    creditAmount: number,
  ) {
    const userDetails = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        meta: true,
      },
    });

    if (!userDetails) {
      throw new Error('User not found');
    }

    if (!userDetails.meta?.casinoToken) {
      throw new Error('Token not found');
    }

    if (creditAmount < 0) {
      this.logger.warn('❌ Invalid creditAmount:', creditAmount);
      throw new Error('OP_ERROR_NEGATIVE_CREDIT_AMOUNT');
    }

    try {
      this.logger.info('🔄 Transaction started for CREDIT:', transactionId);

      // 1️⃣ Fetch user wallet
      const userWallet = await this.prisma.wallet.findFirst({
        where: { userId, type: WalletType.Main },
      });
      this.logger.debug('💰 Fetched user wallet:', userWallet?.id);

      if (!userWallet) {
        this.logger.warn('❌ Wallet not found for user:', userId);
        throw new Error('OP_GENERAL_ERROR');
      }

      // 2️⃣ Fetch casino game
      const casinoGame = await this.prisma.casinoGame.findFirst({
        where: { externalId: gameId },
      });
      this.logger.info(`🎮 Game details fetched: ${casinoGame?.id}`);

      if (!casinoGame) {
        this.logger.warn(`❌ Game not found: ${gameId}`);
        throw new Error('OP_INVALID_GAME');
      }

      // 4️⃣ Check for existing debit transaction
      const existingTxn = await this.prisma.casinoTransaction.findFirst({
        where: {
          providerTransactionId: transactionId,
          providerRoundId: roundId,
          gameId: casinoGame.id,
        },
      });
      if (!existingTxn) {
        this.logger.warn(`❌ Debit transaction not found: ${transactionId}`);
        throw new Error('OP_TRANSACTION_NOT_FOUND');
      }

      // 5️⃣ Ensure not rolled back
      const rollbackTxn = await this.prisma.casinoTransaction.findFirst({
        where: {
          providerTransactionId: transactionId,
          providerRoundId: roundId,
          gameId: casinoGame.id,
          isRollbacked: true,
        },
      });
      if (rollbackTxn) {
        this.logger.warn(`❌ Win after rollback detected: ${transactionId}`);
        throw new Error('OP_ERROR_TRANSACTION_INVALID');
      }

      // 6️⃣ Prevent duplicate credits
      const duplicateCredit = await this.prisma.casinoTransaction.findFirst({
        where: {
          providerTransactionId: transactionId,
          providerRoundId: roundId,
          gameId: casinoGame.id,
          type: WalletTransactionType.Credit,
        },
      });
      if (duplicateCredit) {
        throw new Error('OP_ERROR_TRANSACTION_INVALID');
      }

      return await this.prisma.$transaction(async (tx) => {
        // 3️⃣ Add balance
        this.logger.debug(`➕ Adding balance: ${creditAmount}`);
        let updatedWallet;
        if (creditAmount > 0) {
          updatedWallet = await this.walletService.addBalance(
            userId,
            new Decimal(creditAmount),
            WalletType.Main,
            true,
            {
              tx,
              context: WalletTransactionContext.CasinoWin,
              narration: `Bet win: ${casinoGame.name}/${roundId}`,
            },
          );
        } else {
          updatedWallet = userWallet;
        }

        if (!updatedWallet) {
          this.logger.error(
            `❌ Failed to update wallet balance for user: ${userId}`,
          );
          throw new Error('OP_GENERAL_ERROR');
        }

        // 7️⃣ Compute updated balance
        const updatedUserBalance =
          Number(updatedWallet.amount) -
          Math.abs(Number(updatedWallet.exposureAmount)) -
          Number(updatedWallet.lockedAmount);

        this.logger.debug(
          `💳 Updated user balance calculated: ${updatedUserBalance}`,
        );

        // 8️⃣ Record credit transaction with round history
        await this.transaction({
          txnType: 'CREDIT',
          txnId: transactionId,
          userId: String(userId),
          roundId,
          amount: creditAmount,
          gameId: casinoGame.id,
          completed: false,
          gameName: casinoGame.name,
          context: WalletTransactionContext.CasinoWin,
          prismaTransaction: tx,
        });

        // 9️⃣ Create casino transaction record
        await tx.casinoTransaction.create({
          data: {
            gameId: casinoGame.id,
            userId: userId,
            providerTransactionId: transactionId,
            providerRoundId: roundId,
            amount: existingTxn.amount,
            payout: creditAmount,
            creditTxnId: reqId,
            type: WalletTransactionType.Credit,
            gameCode: casinoGame.code,
            providerCode: casinoGame.gameProviderName,
            gameName: casinoGame.name,
            status: creditAmount > 0 ? BetStatusType.Won : BetStatusType.Lost,
          },
        });

        this.logger.info('✅ Credit transaction committed successfully');
        return { success: true, updatedUserBalance };
      });
    } catch (error: any) {
      this.logger.error('❌ Error in handleCreditCallback:', error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Unable to Credit Amount',
        updatedUserBalance: undefined,
      };
    }
  }

  async casinoRollbackRequest(
    userId: number,
    reqId: string,
    transactionId: string,
    gameId: string,
    roundId: string,
    rollbackAmount: number,
    rollbackReason: string,
  ) {
    const userDetails = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        meta: true,
      },
    });

    if (!userDetails) {
      throw new Error('User not found');
    }

    if (!userDetails.meta?.casinoToken) {
      throw new Error('Token not found');
    }

    try {
      // 1️⃣ Fetch user wallet
      const userWallet = await this.prisma.wallet.findFirst({
        where: { userId, type: WalletType.Main },
      });

      if (!userWallet) {
        this.logger.warn('❌ Wallet not found for user:', userId);
        return { success: false, status: 'OP_GENERAL_ERROR' };
      }

      // 2️⃣ Fetch casino game
      const casinoGame = await this.prisma.casinoGame.findFirst({
        where: { externalId: gameId },
      });
      if (!casinoGame) {
        this.logger.warn('❌ Game not found:', gameId);
        return { success: false, status: 'OP_INVALID_GAME' };
      }

      // 3️⃣ Verify original transaction exists
      const existingTransaction = await this.prisma.casinoTransaction.findFirst(
        {
          where: {
            providerTransactionId: transactionId,
            providerRoundId: roundId,
            gameId: casinoGame.id,
          },
        },
      );
      if (!existingTransaction) {
        this.logger.warn('❌ Transaction not found:', transactionId);
        return { success: false, status: 'OP_TRANSACTION_NOT_FOUND' };
      }

      // 4️⃣ Check for duplicate rollback
      const existingRollback = await this.prisma.casinoTransaction.findFirst({
        where: {
          providerTransactionId: transactionId,
          providerRoundId: roundId,
          gameId: casinoGame.id,
          isRollbacked: true,
        },
      });
      if (existingRollback) {
        this.logger.warn('⚠️ Duplicate rollback detected:', transactionId);
        return { success: false, status: 'OP_DUPLICATE_TRANSACTION' };
      }

      return await this.prisma.$transaction(async (tx) => {
        // 5️⃣ Add refund amount back to balance
        const updatedWallet = await this.walletService.addBalance(
          BigInt(userId),
          new Decimal(rollbackAmount),
          WalletType.Main,
          true,
          {
            tx,
            context: WalletTransactionContext.Rollback,
            narration: `Bet rollback: ${casinoGame.name}/${roundId}`,
          },
        );
        if (!updatedWallet) {
          this.logger.error(
            '❌ Failed to update wallet balance for user:',
            userId,
          );
          return { success: false, status: 'OP_GENERAL_ERROR' };
        }

        // 6️⃣ Compute effective user balance
        const updatedUserBalance =
          Number(updatedWallet.amount) -
          Math.abs(Number(updatedWallet.exposureAmount)) -
          Number(updatedWallet.lockedAmount);

        // 7️⃣ Record rollback transaction
        await tx.casinoTransaction.create({
          data: {
            gameId: casinoGame.id,
            userId: userId,
            providerTransactionId: transactionId,
            providerRoundId: roundId,
            amount: rollbackAmount,
            rollbackTxnId: reqId,
            type: WalletTransactionType.Credit,
            remark: rollbackReason,
            gameCode: casinoGame.code,
            providerCode: casinoGame.gameProviderName,
            gameName: casinoGame.name,
            status: BetStatusType.Voided,
            isRollbacked: true,
          },
        });

        this.logger.info(
          `✅ Rollback processed successfully for: ${transactionId}`,
        );
        return { success: true, updatedUserBalance };
      });
    } catch (error: any) {
      this.logger.error('❌ Error in casinoRollbackRequest:', error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Unable to rollback amount.',
        updatedUserBalance: undefined,
      };
    }
  }

  async changeTrendingStatus(id: number, isTrending: boolean) {
    const casino = await this.prisma.casinoGame.findUnique({ where: { id } });
    if (!casino) throw new Error('Casino game not found');
    return this.prisma.casinoGame.update({
      data: { isTrending },
      where: { id: casino.id },
    });
  }

  async getTrendingCasinos(status?: 'ACTIVE' | 'INACTIVE') {
    const where = status
      ? {
          status: status === 'ACTIVE' ? StatusType.Active : StatusType.Inactive,
        }
      : {};
    return await this.prisma.casinoGame.findMany({
      where: { isTrending: true, ...where },
    });
  }

  async changeCasinoStatus(id: number, status: 'ACTIVE' | 'INACTIVE') {
    const game = await this.prisma.casinoGame.findUnique({ where: { id } });
    if (!game) throw new Error('Casino game not found');
    const updatedGame = await this.prisma.casinoGame.update({
      data: {
        status: status === 'ACTIVE' ? StatusType.Active : StatusType.Inactive,
      },
      where: { id: game.id },
    });
    return updatedGame;
  }

  async addToFavoriteCasinoGame(
    gameId: number,
    userId: bigint,
    status: 'FAVORITE' | 'UNFAVORITE',
  ) {
    const game = await this.prisma.casinoGame.findUnique({
      where: { id: gameId },
    });
    if (!game) throw new Error('Casino game not found');
    if (status === 'FAVORITE') {
      const favorite = await this.prisma.favoriteGame.upsert({
        where: {
          userId_gameId: { userId, gameId }, // uses @@unique([userId, gameId])
        },
        update: {}, // no update needed if it already exists
        create: {
          userId,
          gameId,
        },
      });
      return favorite;
    } else {
      const favorite = await this.prisma.favoriteGame.findUnique({
        where: {
          userId_gameId: { userId, gameId },
        },
      });

      if (!favorite) {
        throw new Error('This game is not in favorite list');
      }

      await this.prisma.favoriteGame.delete({
        where: {
          userId_gameId: { userId, gameId },
        },
      });

      return favorite;
    }
  }

  async getUserFavoriteCasinoGames(userId: bigint, page = 1, limit = 10) {
    page = page < 1 ? 1 : page;
    const skip = (page - 1) * limit;
    this.logger.info('User id', userId);
    // Get total count of favorites
    const count = await this.prisma.favoriteGame.count({
      where: { userId },
    });

    // Fetch favorite games with related CasinoGame data
    const games = await this.prisma.favoriteGame.findMany({
      where: { userId },
      include: {
        game: {
          select: {
            id: true,
            name: true,
            code: true,
            casinoProviderId: true,
            gameImage: true,
            gameProviderName: true,
            priority: true,
            status: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const pagination: Pagination = {
      currentPage: page,
      totalPage: Math.ceil(count / limit),
      totalItems: count,
      limit,
    };

    return { games, pagination };
  }

  async addToRecentGames(gameId: number, userId: bigint) {
    await this.prisma.recentGame.upsert({
      where: {
        userId_gameId: { userId, gameId }, // uses @@unique([userId, gameId])
      },
      update: { playedAt: new Date().toISOString() },
      create: {
        userId,
        gameId,
      },
    });
  }

  async getRecentlyPlayedGames(userId: bigint, limit = 20) {
    return await this.prisma.recentGame.findMany({
      where: { userId },
      include: {
        game: {
          select: {
            id: true,
            name: true,
            code: true,
            casinoProviderId: true,
            gameImage: true,
            gameProviderName: true,
            priority: true,
            status: true,
          },
        },
      },
      take: limit,
      orderBy: {
        playedAt: 'desc',
      },
    });
  }

  // Refresh Most Played Games
  async refreshMostPlayedMaterializedView() {
    try {
      this.logger.info(
        "🔄 Refreshing materialized view 'most_played_casino_games'",
      );
      await this.prisma.$executeRawUnsafe(`
      REFRESH MATERIALIZED VIEW CONCURRENTLY most_played_casino_games;
    `);
      this.logger.info(
        "✅ Materialized view 'most_played_casino_games' refreshed",
      );
    } catch (error: any) {
      // In case concurrent refresh fails (e.g., first run or no index), fallback
      this.logger.error('⚠️ Concurrent refresh failed, retrying normally...');
      this.logger.error(`Error message: ${error.message}`);
      try {
        this.logger.info('🔁 Refreshing materialized view normally');
        await this.prisma.$executeRawUnsafe(
          `REFRESH MATERIALIZED VIEW most_played_casino_games;`,
        );
        this.logger.info(
          "✅ Materialized view 'most_played_casino_games' refreshed normally",
        );
      } catch (err) {
        this.logger.error(
          `❌ Failed to refresh materialized view 'most_played_casino_games': ${err}`,
        );
      }
    }
  }

  async getMostPlayedGame(userId?: bigint) {
    // Use parameterized query to avoid injection
    let favoriteField = '';
    if (userId) {
      favoriteField = `,
          COALESCE((
            SELECT TRUE
            FROM favorite_game AS f
            WHERE f.game_id = mpg.id
              AND f.user_id = $1
            LIMIT 1
          ), FALSE) AS "isFavorite"`;
    }

    // Base query
    const query = `
        SELECT cg.id, cg.external_id AS externalId, cg.name, cg.code, cg.game_provider_name AS providerName, cg.category, cg.game_image AS gameImage, cg.status ${favoriteField}
        FROM most_played_casino_games AS mpg
        INNER JOIN casino_game AS cg
          ON cg.id = mpg.id
        WHERE cg.status = 'active'
        ORDER BY mpg.total_bets DESC
        LIMIT 20;
      `;

    // Run safely (parameterized if userId exists)
    const results = userId
      ? await this.prisma.$queryRawUnsafe(query, userId)
      : await this.prisma.$queryRawUnsafe(query);

    return results;
  }

  async getRoundHistory(
    userId: bigint,
    userType: UserType,
    options: CasinoHistoryRequest,
    isExport?: boolean,
  ) {
    // Pagination defaults
    let take = undefined,
      skip = undefined;
    if (
      !isExport &&
      options.page &&
      options.limit &&
      !isNaN(options.limit) &&
      !isNaN(options.page)
    ) {
      options.page = options.page < 1 ? 1 : options.page;
      take = options.limit;
      skip = (options.page - 1) * options.limit;
    }

    // 👇 Define properly typed where filter
    const where: Prisma.CasinoRoundHistoryWhereInput = {};

    if (options.fromDate || options.toDate) {
      where.createdAt = {};

      if (options.fromDate) {
        where.createdAt.gte = options.fromDate;
      }

      if (options.toDate) {
        where.createdAt.lte = options.toDate;
      }
    }

    if (options.status) {
      where.status = options.status;
    }

    if (options.provider) {
      where.casinoGame = {
        gameProviderName: options.provider,
      };
    }

    if (userId && userType === UserType.User) {
      where.userId = userId;
    }
    // else {
    //   // Prisma doesn’t support ltree operators directly.
    //   // Using prefix match for similar logic:
    //   // where.user = {
    //   //   meta: {
    //   //     upline: {
    //   //       startsWith: `${_path}.`,
    //   //     },
    //   //   },
    //   // };

    //   const usersWithPath = await this.prisma.$queryRaw<{ id: bigint }[]>`
    //   SELECT u.id
    //   FROM "user" u
    //   JOIN "user_meta" um ON um.user_id = u.id
    //   WHERE um."upline"::ltree ~ ${_path} || '.*{1}'
    // `;

    //   const userIds = usersWithPath.map((u) => u.id);
    //   // if (userIds.length === 0) {
    //   //   return { count: 0, skip, take: take, rows: [] };
    //   // }

    //   // Inject userId filter safely, still typed
    //   where.userId = { in: userIds };
    // }

    if (options.search) {
      where.OR = [
        {
          casinoGame: {
            name: {
              contains: options.search,
              mode: 'insensitive',
            },
          },
        },
        {
          user: {
            username: {
              contains: options.search,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    // ✅ Count total records
    const count = await this.prisma.casinoRoundHistory.count({
      where,
    });

    // ✅ Fetch paginated records
    const rows = await this.prisma.casinoRoundHistory.findMany({
      where,
      skip: isExport ? undefined : skip,
      take: isExport ? undefined : take,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            // meta: true,
          },
        },
        casinoGame: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (isExport) {
      return {
        rounds: rows,
        totalItems: count,
      };
    }

    const totalPage = Math.ceil(
      count /
        (options.limit && options.limit > 0
          ? options.limit
          : count < 1
            ? 1
            : count),
    );

    const pagination: Pagination = {
      currentPage: options.page ?? 1,
      totalPage,
      totalItems: count,
      limit: take ?? count,
    };

    return {
      rounds: rows,
      pagination,
    };
  }

  // async casinoGameProvider(
  //   aggregator?: string,
  //   search?: string,
  //   page = 1,
  //   limit = 20,
  // ) {
  //   try {
  //     // Pagination defaults
  //     let take = undefined,
  //       skip = undefined;
  //     if (page && limit && !isNaN(limit) && !isNaN(page)) {
  //       page = page < 1 ? 1 : page;
  //       take = limit;
  //       skip = (page - 1) * limit;
  //     }
  //     const cleanSearch = search?.replace(/_/g, ' ');

  //     // Build dynamic filter
  //     const where: Prisma.CasinoGameWhereInput = {};

  //     // Aggregator → casinoProvider.name
  //     if (aggregator) {
  //       where.casinoProvider = {
  //         name: aggregator,
  //       };
  //     }

  //     // Search → gameProviderName / name
  //     if (cleanSearch) {
  //       where.OR = [
  //         { gameProviderName: { contains: cleanSearch, mode: 'insensitive' } },
  //         { name: { contains: cleanSearch, mode: 'insensitive' } },
  //       ];
  //     }

  //     // 1️⃣ Group by provider + aggregator (Prisma groupBy)
  //     const grouped = await this.prisma.casinoGame.groupBy({
  //       by: ['gameProviderName'],
  //       where,
  //       _count: { _all: true },
  //       _max: { status: true },
  //       // skip,
  //       // take: take,
  //       orderBy: { gameProviderName: 'asc' },
  //     });

  //     // 2️⃣ Get aggregator (casinoProvider) names
  //     // Fetch unique providerId → name map to avoid N+1 queries
  //     // const providerIds = [
  //     //   ...new Set(
  //     //     grouped.map((g) => g.casinoProviderId).filter((v) => v !== null),
  //     //   ),
  //     // ];

  //     // const providerMap = await this.prisma.provider.findMany({
  //     //   where: { id: { in: providerIds } },
  //     //   select: { id: true, name: true },
  //     // });

  //     // const aggregatorMap = Object.fromEntries(
  //     //   providerMap.map((p) => [p.id, p.name]),
  //     // );

  //     console.log('Stage1', grouped.length);

  //     // 3️⃣ Transform results
  //     const providers = grouped.map((g) => ({
  //       provider: this.normalizeProvider(g.gameProviderName),
  //       // aggregator: aggregatorMap[g.casinoProviderId ?? 0] ?? null,
  //       status:
  //         g._max.status === StatusType.Active
  //           ? StatusType.Active
  //           : StatusType.Inactive,
  //     }));

  //     const unique = [
  //       ...new Set(providers.map((item) => JSON.stringify(item))),
  //     ].map((item) => JSON.parse(item));

  //     // 4️⃣ Count distinct providers for pagination
  //     // const totalProviders = await this.prisma.casinoGame.groupBy({
  //     //   by: ['gameProviderName'],
  //     //   where,
  //     // });

  //     const totalPage = Math.ceil(unique.length / limit);

  //     const pagination: Pagination = {
  //       currentPage: page ?? 1,
  //       totalPage,
  //       totalItems: unique.length,
  //       limit: take ?? unique.length,
  //     };

  //     return {
  //       providers: [...unique].slice(skip, page * limit),
  //       pagination,
  //     };
  //   } catch (error) {
  //     this.logger.error('Error in casinoGameProvider:', error);
  //     throw new Error('Unable to fetch casino providers');
  //   }
  // }
  async casinoGameProvider(
    aggregator?: string,
    search?: string,
    page = 1,
    limit = 20,
  ) {
    try {
      // Pagination defaults
      let take = undefined,
        skip = undefined;
      if (page && limit && !isNaN(limit) && !isNaN(page)) {
        page = page < 1 ? 1 : page;
        take = limit;
        skip = (page - 1) * limit;
      }
      const cleanSearch = search?.replace(/_/g, ' ');

      // Build dynamic filter
      const where: Prisma.CasinoGameWhereInput = {};

      // Aggregator → casinoProvider.name
      if (aggregator) {
        where.casinoProvider = {
          name: aggregator,
        };
      }

      // Search → gameProviderName / name
      if (cleanSearch) {
        where.OR = [
          { gameProviderName: { contains: cleanSearch, mode: 'insensitive' } },
          { name: { contains: cleanSearch, mode: 'insensitive' } },
        ];
      }

      // 1️⃣ Group by provider + aggregator (Prisma groupBy)
      const grouped = await this.prisma.casinoGame.groupBy({
        by: ['gameProviderName'],
        where,
        _count: { _all: true },
        _max: { status: true },
        // skip,
        // take: take,
        orderBy: { gameProviderName: 'asc' },
      });

      // 2️⃣ Get aggregator (casinoProvider) names
      // Fetch unique providerId → name map to avoid N+1 queries
      // const providerIds = [
      //   ...new Set(
      //     grouped.map((g) => g.casinoProviderId).filter((v) => v !== null),
      //   ),
      // ];

      // const providerMap = await this.prisma.provider.findMany({
      //   where: { id: { in: providerIds } },
      //   select: { id: true, name: true },
      // });

      // const aggregatorMap = Object.fromEntries(
      //   providerMap.map((p) => [p.id, p.name]),
      // );

      // 3️⃣ Transform results
      const providers = grouped.map((g) => ({
        provider: this.normalizeProvider(g.gameProviderName),
        // aggregator: aggregatorMap[g.casinoProviderId ?? 0] ?? null,
        status:
          g._max.status === StatusType.Active
            ? StatusType.Active
            : StatusType.Inactive,
      }));

      const unique = [
        ...new Set(providers.map((item) => JSON.stringify(item))),
      ].map((item) => JSON.parse(item));

      // 4️⃣ Count distinct providers for pagination
      // const totalProviders = await this.prisma.casinoGame.groupBy({
      //   by: ['gameProviderName'],
      //   where,
      // });

      const priorityProviders = [
        'JDB Gaming',
        'Pragmatic Play',
        'Evolution Gaming',
        'Mac88',
        'Smartsoft Gaming',
        'Spribe',
        'Ezugi',
        'Turbo Games',
        'JiLi',
        'SEXYBCRT',
        'Playtech',
        'Betsoft',
        'Gamzix',
        'BetGames',
        'Evoplay Entertainment',
        'Asia Gaming',
        'winfinity',
        'Vivo Gaming',
        'KINGMAKER',
        'Kingmidas',
        'Royal Gaming',
      ];

      const normalizedPriority = priorityProviders.map((p) =>
        this.normalizeProvider(p),
      );

      const prioritySet = new Set(normalizedPriority);

      const priorityIndexMap = new Map<string, number>(
        normalizedPriority.map((name, index) => [name, index]),
      );

      // 5️⃣ Split providers
      const priorityFound: any[] = [];
      const others: any[] = [];

      for (const item of unique) {
        if (prioritySet.has(item.provider)) {
          priorityFound.push(item);
        } else {
          others.push(item);
        }
      }

      // 6️⃣ Sort priority in exact priority order
      priorityFound.sort(
        (a, b) =>
          priorityIndexMap.get(a.provider)! - priorityIndexMap.get(b.provider)!,
      );

      // 7️⃣ Sort others alphabetically
      others.sort((a, b) => a.provider.localeCompare(b.provider));

      // 8️⃣ Merge priority + others
      const finalProviders = [...priorityFound, ...others];

      // 🔢 Pagination (REAL pagination)
      const safeSkip = skip ?? 0;
      const safeLimit = take ?? finalProviders.length;

      const totalPage = Math.ceil(finalProviders.length / safeLimit);

      const pagination: Pagination = {
        currentPage: page ?? 1,
        totalPage,
        totalItems: finalProviders.length,
        limit: safeLimit,
      };

      // ✅ Final return
      return {
        providers: finalProviders.slice(safeSkip, safeSkip + safeLimit),
        pagination,
      };
    } catch (error) {
      this.logger.error('Error in casinoGameProvider:', error);
      throw new Error('Unable to fetch casino providers');
    }
  }

  private normalizeProvider(provider: string): string {
    const key = provider.toUpperCase().replace(/[_\s]+/g, '');
    // .replace(/(LOBBY|VIRTUAL|LIVE)$/g, '');
    console.log('Provider', provider);

    switch (key) {
      case 'ROYALGAMING':
        return 'Royal Gaming';

      case 'TURBO':
      case 'TURBOGAMES':
        return 'Turbo Games';

      case 'YUVIGAMES':
        return 'Yuvi Games';

      case 'VIVOGAMING':
        return 'Vivo Gaming';

      case 'TVBET':
        return 'TVBet';

      case 'SPRIBE':
        return 'Spribe';

      case 'BETGAMES':
        return 'BetGames';

      case 'EZUGI':
        return 'Ezugi';

      case 'CRASH88':
      case 'MINICRASH':
        return 'Crash88';

      case 'CREED':
      case 'CREEDROOMZ':
      case 'POPOK':
        return 'Creed';

      case 'JILI':
        return 'JiLi';

      case 'KINGMIDAS':
        return 'Kingmidas';

      case 'MAC88':
      case 'MAC88GAMING':
      case 'MAC88LITE':
      case 'MAC88GAMINGVIRTUAL':
      case 'MACEXCITE':
        return 'Mac88';

      case 'MACAW':
        return 'Macaw';

      case 'MARBLES':
        return 'Marbles';

      case 'PRAGMATICPLAY':
      case 'PRAGMATICPLAY2':
        return 'Pragmatic Play';

      case 'SUNO':
      case 'SUPERNOWA':
        return 'Suno';

      case 'Aviator Studio':
      case 'Aviator Studio Gaming':
        return 'Aviator Studio';

      case 'PG':
      case 'PGSOFT':
        return 'PG Soft';

      case 'PLAYTECHLIVE':
      case 'PLAYTECH':
        return 'Playtech';

      default:
        return provider;
      // .toLowerCase()
      // .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  //   private providerVariants1: Record<string, string[]> = {
  //   'Royal Gaming': [
  //     'Royal Gaming',
  //     'Royal Gaming Lobby',
  //     'Royal Gaming Virtual',
  //   ],
  //   'Turbo Games': ['TURBO', 'Turbogames', 'Turbo Games'],
  //   'Yuvi Games': ['Yuvi Games', 'Yuvi Games Lobby'],
  //   'Vivo Gaming': ['Vivo Gaming', 'VivoGaming'],
  //   TVBet: ['Tvbet', 'TVBet'],
  //   Spribe: ['SPRIBE'],
  //   BetGames: ['BETGAMES', 'BetGames'],
  //   Ezugi: ['EZUGI', 'Ezugi'],
  //   Crash88: ['CRASH88', 'CRASH88 Gaming', 'Mini Crash'],
  //   Creed: ['CREED', 'Creedroomz', 'Popok'],
  //   JiLi: ['JILI', 'JiLi Gaming'],
  //   Kingmidas: ['KINGMIDAS', 'Kingmidas Gaming'],
  //   Mac88: [
  //     'MAC88',
  //     'Mac88 Gaming',
  //     'Mac88 Gaming Virtual',
  //     'MAC88 Lite',
  //     'MAC Excite',
  //   ],
  //   'Aviator Studio': ['Aviator Studio', 'Aviator Studio Gaming'],
  //   Macaw: ['MACAW', 'Macaw Gaming'],
  //   Marbles: ['MARBLES', 'Marbles'],
  //   'Pragmatic Play': [
  //     'Pragmatic Play',
  //     'Pragmatic Play 2',
  //     'Pragmatic Play Live',
  //   ],
  //   Suno: ['SUNO', 'SuperNowa'],
  //   'PG Soft': ['PG', 'PGSoft'],
  // };

  private getRawProvidersForStatus(provider: string): string[] {
    const key = provider.toUpperCase().replace(/[_\s]+/g, '');

    switch (key) {
      case 'ROYALGAMING':
        return [
          'ROYALGAMING',
          'Royal Gaming',
          'Royal Gaming Lobby',
          'Royal Gaming Virtual',
        ];

      case 'TURBOGAMES':
        return ['TURBO', 'TURBOGAMES', 'Turbo Games'];

      case 'YUVIGAMES':
        return ['YUVIGAMES', 'Yuvi Games', 'Yuvi Games Lobby'];

      case 'VIVOGAMING':
        return ['VIVOGAMING', 'Vivo Gaming', 'VivoGaming'];

      case 'TVBET':
        return ['TVBET', 'TV Bet', 'Tvbet'];

      case 'SPRIBE':
        return ['SPRIBE'];

      case 'BETGAMES':
        return ['BETGAMES'];

      case 'EZUGI':
        return ['EZUGI'];

      case 'CRASH88':
        return [
          'CRASH88',
          'MINICRASH',
          'Crash88',
          'Crash88 Gaming',
          'Mini Crash',
        ];

      case 'CREED':
        return ['CREED', 'CREEDROOMZ', 'POPOK', 'Creed', 'Creedroomz', 'Popok'];

      case 'JILI':
        return ['JILI', 'JiLi', 'JiLi Gaming'];

      case 'KINGMIDAS':
        return ['KINGMIDAS', 'Kingmidas', 'Kingmidas Gaming'];

      case 'MAC88':
        return [
          'MAC88',
          'MACEXCITE',
          'Mac88 Gaming',
          'MAC88 Lite',
          'Mac88 Gaming Virtual',
          'Mac88',
          'MAC Excite',
        ];

      case 'MACAW':
        return ['MACAW', 'Macaw', 'Macaw Gaming'];

      case 'MARBLES':
        return ['MARBLES', 'Marbles', 'Marbles Gaming'];

      case 'PRAGMATICPLAY':
        return [
          'PRAGMATICPLAY',
          'PRAGMATICPLAY2',
          'Pragmatic Play',
          'Pragmaticplay',
          'Pragmatic Play 2',
          'Pragmatic Play 1',
          'Pragmatic Play Live',
        ];

      case 'SUNO':
        return ['SUNO', 'SUPERNOWA', 'Suno', 'SuperNowa'];

      case 'PGSOFT':
        return ['PG', 'PGSOFT', 'PG Soft'];

      case 'AVIATORSTUDIO':
        return ['Aviator Studio', 'Aviator Studio Gaming', 'AviatorStudio'];

      case 'PLAYTECHLIVE':
      case 'PLAYTECH':
        return ['Playtech', 'Playtech Live'];

      default:
        return [provider];
    }
  }

  // async casinoGameProvider(
  //   aggregator?: string,
  //   search?: string,
  //   page = 1,
  //   limit = 20,
  // ) {
  //   try {
  //     const cleanSearch = search?.replace(/_/g, ' ');

  //     const where: Prisma.CasinoGameWhereInput = {};

  //     // if (aggregator) {
  //     //   where.casinoProvider = { name: aggregator };
  //     // }

  //     if (cleanSearch) {
  //       where.OR = [
  //         { gameProviderName: { contains: cleanSearch, mode: 'insensitive' } },
  //         { name: { contains: cleanSearch, mode: 'insensitive' } },
  //       ];
  //     }

  //     // 🔹 Fetch raw providers
  //     const rows = await this.prisma.casinoGame.findMany({
  //       where,
  //       select: {
  //         gameProviderName: true,
  //         status: true,
  //         casinoProvider: {
  //           select: { name: true },
  //         },
  //       },
  //     });

  //     const providerMap = new Map<
  //       string,
  //       { provider: string; aggregator: string; status: StatusType }
  //     >();

  //     for (const row of rows) {
  //       const provider = this.normalizeProvider(row.gameProviderName);
  //       const aggregatorName = row.casinoProvider?.name ?? '';

  //       const existing = providerMap.get(provider);

  //       if (!existing) {
  //         providerMap.set(provider, {
  //           provider,
  //           aggregator: aggregatorName,
  //           status: row.status,
  //         });
  //       } else {
  //         // If any row is Active → Active
  //         if (row.status === StatusType.Active) {
  //           existing.status = StatusType.Active;
  //         }
  //       }
  //     }

  //     const providers = Array.from(providerMap.values()).sort((a, b) =>
  //       a.provider.localeCompare(b.provider),
  //     );

  //     // 🔹 Pagination
  //     page = page < 1 ? 1 : page;
  //     const take = limit;
  //     const skip = (page - 1) * take;

  //     return {
  //       success: true,
  //       message: 'Provider fetched successfully',
  //       providers: providers.slice(skip, skip + take),
  //       pagination: {
  //         currentPage: page,
  //         totalPage: Math.ceil(providers.length / take),
  //         totalItems: providers.length,
  //         limit: take,
  //       },
  //     };
  //   } catch (error) {
  //     this.logger.error('Error in casinoGameProvider:', error);
  //     throw new Error('Unable to fetch casino providers');
  //   }
  // }

  // async changeProviderStatus(provider: string, status: 'ACTIVE' | 'INACTIVE') {
  //   await this.prisma.casinoGame.updateMany({
  //     where: { gameProviderName: provider },
  //     data: {
  //       status: status === 'ACTIVE' ? StatusType.Active : StatusType.Inactive,
  //     },
  //   });
  //   return { name: provider, status };
  // }

  async changeProviderStatus(provider: string, status: 'ACTIVE' | 'INACTIVE') {
    const rawProviders = this.getRawProvidersForStatus(provider);

    await this.prisma.casinoGame.updateMany({
      where: {
        gameProviderName: {
          in: rawProviders,
          mode: 'insensitive',
        },
      },
      data: {
        status: status === 'ACTIVE' ? StatusType.Active : StatusType.Inactive,
      },
    });

    return { name: provider, status };
  }

  async updateCasinoGame(id: number, data: UpdateCasinoGame) {
    // 1️⃣ Fetch the game
    const game = await this.prisma.casinoGame.findUnique({
      where: { id },
    });

    if (!game) throw new Error('Casino game not found');

    // 2️⃣ Build dynamic update object
    const updateFields: Prisma.CasinoGameUpdateInput = {};

    if (data.category?.trim()) {
      updateFields.category = data.category.trim();
    }

    if (data.gameCode?.trim() && game.code !== data.gameCode.trim()) {
      // ensure game_code (code) is unique
      const existing = await this.prisma.casinoGame.findFirst({
        where: { code: data.gameCode.trim() },
      });
      if (existing) throw new Error('Game code should be unique');

      updateFields.code = data.gameCode.trim();
    }

    if (data.gameName?.trim()) {
      updateFields.name = data.gameName.trim();
    }

    if (data.provider?.trim()) {
      updateFields.gameProviderName = data.provider.trim();
    }

    if (data.thumbnailImage?.trim()) {
      // const images = [...(game.gameImage ? [game.gameImage] : [])];
      // images.push(data.thumbnailImage.trim());
      updateFields.gameImage = data.thumbnailImage.trim();
    }

    if (typeof data.trendingStatus === 'boolean') {
      updateFields.isTrending = data.trendingStatus;
    }

    if (data.priority !== undefined) {
      updateFields.priority = data.priority;
    }

    // 3️⃣ Perform update
    const updatedGame = await this.prisma.casinoGame.update({
      where: { id },
      data: updateFields,
    });

    return updatedGame;
  }

  async exportCasinoRountReport(
    userId: bigint,
    userType: UserType,
    _path: string,
    params: CasinoHistoryExportRequest,
  ) {
    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.casinoRoundHistory,
        format: params.exportFormat,
        status: 'Pending',
        filters: {
          provider: params.provider,
          status: params.status,
          userId: userId.toString(), // ✅ bigint → string
          _path: _path,
          UserType: userType,
          fromDate: params.formData?.toISOString() || undefined,
          toDate: params.toDate?.toISOString() || undefined,
        },
      },
    });

    return {
      message:
        'Your casinoRoundHistory report export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
    };
  }

  async exportCasinoGameReport(params: exportCasinoGamesPayload) {
    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.casinoGame,
        format: params.exportFormat,
        status: 'Pending',
        filters: {
          provider: params.provider,
          category: params.category,
        },
      },
    });

    return {
      message: 'Your CasinoGame report export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
    };
  }

  // Casino Turnover
  async getCasinoTurnover(startDate: Date, endDate: Date) {
    return await this.prisma.casinoRoundHistory.groupBy({
      by: ['userId'],
      where: {
        completed: true,
        createdAt: { gte: startDate, lte: endDate },
      },
      _sum: {
        totalBets: true,
      },
    });
  }

  async casinoProfitLossByUserId(
    userId: bigint | number,
    query: CasinoProfitLossRequest,
  ) {
    const where: Prisma.CasinoRoundHistoryWhereInput = {
      userId,
      // completed: true,
    };
    if (query.fromDate || query.toDate) {
      where.createdAt = {};

      if (query.fromDate) {
        where.createdAt.gte = query.fromDate;
      }

      if (query.toDate) {
        where.createdAt.lte = query.toDate;
      }
    }
    console.log('Where', where);

    const rounds = await this.prisma.casinoRoundHistory.findMany({
      where,
      include: {
        casinoGame: {
          select: {
            id: true,
            name: true,
            gameProviderName: true,
            code: true,
            category: true,
          },
        },
      },
    });
    console.log(rounds);
    const providers: any = {};

    for (const r of rounds) {
      if (!r.casinoGame) continue;
      const providerName = r.casinoGame.gameProviderName;

      const gameId = r.casinoGame.id;
      const gameName = r.casinoGame.name;
      const gameCode = r.casinoGame.code;
      const gameCategory = r.casinoGame.category;

      const profitLoss = Number(r.totalWins) - Number(r.totalBets);
      const stake = Number(r.totalBets);

      // Provider group
      if (!providers[providerName]) {
        providers[providerName] = {
          providerName,
          totalProfit: 0,
          totalStake: 0,
          games: {},
        };
      }

      // Game group inside provider
      if (!providers[providerName].games[gameId]) {
        providers[providerName].games[gameId] = {
          gameId,
          gameName,
          gameCode,
          gameCategory,
          profitLoss: 0,
          totalStake: 0,
        };
      }

      // Apply profit-loss
      providers[providerName].games[gameId].profitLoss += profitLoss;
      providers[providerName].games[gameId].totalStake += stake;
      providers[providerName].totalProfit += profitLoss;
      providers[providerName].totalStake += stake;
    }

    // Convert games {} into array
    const response = Object.values(providers).map((p: any) => ({
      providerName: p.providerName,
      totalProfit: p.totalProfit,
      totalStake: p.totalStake,
      games: Object.values(p.games),
    }));

    return response;
  }

  async getGameById(id: number) {
    const game = await this.prisma.casinoGame.findUnique({ where: { id } });
    if (!game) throw new Error('Casino game not found');
    return game;
  }

  async getStaticCasino() {
    const allGameNames = Object.values(CASINO_CATEGORIES).flat();

    const games = await this.prisma.casinoGame.findMany({
      where: {
        OR: allGameNames.map((name) => ({
          name: {
            equals: name,
            mode: 'insensitive',
          },
        })),
        status: StatusType.Active,
      },
      select: {
        id: true,
        name: true,
        gameImage: true,
      },
    });

    const gameMap = new Map<
      string,
      { id: number; name: string; gameImage: string }
    >();
    games.forEach((game) => {
      gameMap.set(game.name.toLowerCase(), game);
    });

    const result = Object.entries(CASINO_CATEGORIES).map(
      ([title, gameNames]) => ({
        title,
        games: gameNames
          .map((name) => gameMap.get(name.toLowerCase()))
          .filter(Boolean),
      }),
    );

    return result;
  }
}
