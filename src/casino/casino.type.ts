import { CasinoGame, Prisma } from '@prisma/client';

export type CasinoGameWithFavorite = Prisma.CasinoGameGetPayload<{
  include: { favoriteGames: { select: { id: true } } };
}>;

export interface FinalGames extends CasinoGame {
  isFavorite: boolean;
}
