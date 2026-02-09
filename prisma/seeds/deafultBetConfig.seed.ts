import { betConfigFactory } from '../../src/configs/bet.config';
import { Prisma, PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const seedBetConfig = async () => {
  const bet = betConfigFactory();

  // check if default bet config already exists
  const exists = await prisma.betConfig.findFirst({
    where: { isDefault: true, eventId: null },
  });

  if (exists) {
    await prisma.betConfig.update({
      where: { id: exists.id },
      data: {
        isDefault: true,
        eventId: null,

        exposureLimit: new Prisma.Decimal(bet.exposureLimit),
        inPlayMaxBetAmount: new Prisma.Decimal(bet.inplayMaxBetAmount),
        inPlayMinBetAmount: new Prisma.Decimal(bet.inplayMinBetAmount),

        offPlayMaxBetAmount: new Prisma.Decimal(bet.offplayMaxBetAmount),
        offPlayMinBetAmount: new Prisma.Decimal(bet.offplayMinBetAmount),

        potentialProfit: new Prisma.Decimal(bet.potentialProfit),
        minRate: new Prisma.Decimal(bet.minRate),
        maxRate: new Prisma.Decimal(bet.maxRate),

        sessionInPlayMaxBetAmount: new Prisma.Decimal(
          bet.sessionInplayMaxBetAmount,
        ),
        sessionInPlayMinBetAmount: new Prisma.Decimal(
          bet.sessionInplayMinBetAmount,
        ),

        sessionOffPlayMaxBetAmount: new Prisma.Decimal(
          bet.sessionOffplayMaxBetAmount,
        ),
        sessionOffPlayMinBetAmount: new Prisma.Decimal(
          bet.sessionOffplayMinBetAmount,
        ),

        sessionPotentialProfit: new Prisma.Decimal(bet.sessionPotentialProfit),
        sessionMinRate: new Prisma.Decimal(bet.sessionMinRate),
        sessionMaxRate: new Prisma.Decimal(bet.sessionMaxRate),

        bookmakerInPlayMaxBetAmount: new Prisma.Decimal(
          bet.bookmakerInplayMaxBetAmount,
        ),
        bookmakerInPlayMinBetAmount: new Prisma.Decimal(
          bet.bookmakerInplayMinBetAmount,
        ),

        bookmakerOffPlayMaxBetAmount: new Prisma.Decimal(
          bet.bookmakerOffplayMaxBetAmount,
        ),
        bookmakerOffPlayMinBetAmount: new Prisma.Decimal(
          bet.bookmakerOffplayMinBetAmount,
        ),

        bookmakerPotentialProfit: new Prisma.Decimal(
          bet.bookmakerPotentialProfit,
        ),
        bookmakerMinRate: new Prisma.Decimal(bet.bookmakerMinRate),
        bookmakerMaxRate: new Prisma.Decimal(bet.bookmakerMaxRate),

        delay: bet.betDelay,
      },
    });
    console.log(
      'Default BetConfig already exists. BetConfig updated successfully.',
    );
    return;
  }

  console.log('Creating default BetConfig...');

  await prisma.betConfig.create({
    data: {
      isDefault: true,
      eventId: null,

      exposureLimit: new Prisma.Decimal(bet.exposureLimit),
      inPlayMaxBetAmount: new Prisma.Decimal(bet.inplayMaxBetAmount),
      inPlayMinBetAmount: new Prisma.Decimal(bet.inplayMinBetAmount),

      offPlayMaxBetAmount: new Prisma.Decimal(bet.offplayMaxBetAmount),
      offPlayMinBetAmount: new Prisma.Decimal(bet.offplayMinBetAmount),

      potentialProfit: new Prisma.Decimal(bet.potentialProfit),
      minRate: new Prisma.Decimal(bet.minRate),
      maxRate: new Prisma.Decimal(bet.maxRate),

      sessionInPlayMaxBetAmount: new Prisma.Decimal(
        bet.sessionInplayMaxBetAmount,
      ),
      sessionInPlayMinBetAmount: new Prisma.Decimal(
        bet.sessionInplayMinBetAmount,
      ),

      sessionOffPlayMaxBetAmount: new Prisma.Decimal(
        bet.sessionOffplayMaxBetAmount,
      ),
      sessionOffPlayMinBetAmount: new Prisma.Decimal(
        bet.sessionOffplayMinBetAmount,
      ),

      sessionPotentialProfit: new Prisma.Decimal(bet.sessionPotentialProfit),
      sessionMinRate: new Prisma.Decimal(bet.sessionMinRate),
      sessionMaxRate: new Prisma.Decimal(bet.sessionMaxRate),

      bookmakerInPlayMaxBetAmount: new Prisma.Decimal(
        bet.bookmakerInplayMaxBetAmount,
      ),
      bookmakerInPlayMinBetAmount: new Prisma.Decimal(
        bet.bookmakerInplayMinBetAmount,
      ),

      bookmakerOffPlayMaxBetAmount: new Prisma.Decimal(
        bet.bookmakerOffplayMaxBetAmount,
      ),
      bookmakerOffPlayMinBetAmount: new Prisma.Decimal(
        bet.bookmakerOffplayMinBetAmount,
      ),

      bookmakerPotentialProfit: new Prisma.Decimal(
        bet.bookmakerPotentialProfit,
      ),
      bookmakerMinRate: new Prisma.Decimal(bet.bookmakerMinRate),
      bookmakerMaxRate: new Prisma.Decimal(bet.bookmakerMaxRate),

      delay: bet.betDelay,
    },
  });

  console.log('Default BetConfig created successfully.');
};
