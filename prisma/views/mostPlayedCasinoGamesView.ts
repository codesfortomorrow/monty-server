import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function createMostPlayedCasinoGamesView() {
  try {
    console.log("🧱 Creating materialized view 'most_played_casino_games'...");

    // Drop old view if it exists
    await prisma.$executeRawUnsafe(`
      DROP MATERIALIZED VIEW IF EXISTS most_played_casino_games;
    `);

    // Create new view
    await prisma.$executeRawUnsafe(`
      CREATE MATERIALIZED VIEW most_played_casino_games AS
      SELECT
          g.id AS id,
          g.external_id AS external_id,
          COUNT(t.id) AS total_bets,
          COUNT(DISTINCT t.user_id) AS unique_players,
          SUM(t.amount) AS total_bet_amount,
          MAX(t.created_at) AS last_played_at
      FROM casino_transaction t
      JOIN casino_game g ON t.game_id = g.id
      WHERE t.type = 'debit' AND g.status = 'active'
      GROUP BY g.id, g.external_id
      ORDER BY COUNT(t.id) DESC
      LIMIT 30
      WITH DATA;
    `);

    // Create index separately
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_most_played_games_id 
      ON most_played_casino_games (id);
    `);

    console.log(
      "✅ Materialized view 'most_played_casino_games' created successfully!",
    );
  } catch (error) {
    console.error(
      "❌ Failed to create materialized view 'most_played_casino_games':",
      error,
    );
  }
}
