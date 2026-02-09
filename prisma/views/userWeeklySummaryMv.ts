// import { PrismaClient } from '@prisma/client';

// const prisma = new PrismaClient();

// export async function createAffiliateWeeklySummaryView() {
//   try {
//     console.log(
//       "🧱 Creating materialized view 'affiliate_weekly_summary_mv'...",
//     );

//     // Drop old view if it exists
//     await prisma.$executeRawUnsafe(`
//       DROP MATERIALIZED VIEW IF EXISTS affiliate_weekly_summary_mv;
//     `);

//     // Create new view
//     await prisma.$executeRawUnsafe(`
//       CREATE MATERIALIZED VIEW affiliate_weekly_summary_mv AS
//       SELECT
//           ar.affiliate_id AS affiliate_id,

//           /* ---------------------- DEPOSIT TOTAL ---------------------- */
//           COALESCE(SUM(
//               CASE
//                   WHEN wt.context IN ('deposit', 'crypto_deposit')
//                   THEN wt.amount
//                   ELSE 0
//               END
//           ), 0) AS total_deposit,

//           /* ---------------------- WITHDRAWAL TOTAL ---------------------- */
//           COALESCE(SUM(
//               CASE
//                   WHEN wt.context IN ('withdrawal', 'crypto_withdrawal')
//                   THEN wt.amount
//                   ELSE 0
//               END
//           ), 0) AS total_withdrawal,

//           COALESCE(SUM(
//               CASE
//                 WHEN wt.type = 'debit'
//                 AND wt.context IN ('win','bet','bet_refund','rollback','casino_bet','casino_bet_refund','casino_win')
//               THEN wt.amount
//                 WHEN wt.type = 'credit'
//                 AND wt.context IN ('win','bet','bet_refund','rollback','casino_bet','casino_bet_refund','casino_win')
//               THEN -wt.amount
//               ELSE 0 END
//           ), 0) AS customer_profit_loss,

//           /* ---------------------- BONUS ---------------------- */
//           COALESCE(SUM(
//               CASE WHEN wt.context = 'bonus' THEN wt.amount ELSE 0 END
//           ), 0) AS total_bonus

//       FROM affiliate_referral ar
//       LEFT JOIN wallets w
//           ON w.user_id = ar.referred_user_id

//       LEFT JOIN wallet_transactions wt
//           ON wt.wallet_id = w.id
//           AND wt.status IN ('confirmed', 'approved')
//           AND wt.timestamp::date BETWEEN (CURRENT_DATE - INTERVAL '7 days')
//                                      AND (CURRENT_DATE - INTERVAL '1 day')
//       WHERE ar.is_active = true
//       GROUP BY ar.affiliate_id
//       WITH DATA;
//     `);

//     await prisma.$executeRawUnsafe(`
//       CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_weekly_summary_affiliate_id
//       ON affiliate_weekly_summary_mv (affiliate_id);
//     `);

//     console.log(
//       "✅ Materialized view 'affiliate_weekly_summary_mv' created successfully!",
//     );
//   } catch (error) {
//     console.error(
//       "❌ Failed to create materialized view 'affiliate_weekly_summary_mv':",
//       error,
//     );
//   }
// }

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function createUserWeeklySummaryView() {
  try {
    console.log("🧱 Creating materialized view 'user_weekly_summary_mv'...");

    // Drop old view if exists
    await prisma.$executeRawUnsafe(`
      DROP MATERIALIZED VIEW IF EXISTS user_weekly_summary_mv;
    `);

    // Create new materialized view
    await prisma.$executeRawUnsafe(`
      CREATE MATERIALIZED VIEW user_weekly_summary_mv AS
      SELECT
          u.id AS user_id,
          u.username AS username,

          /* ---------------------- TOTAL DEPOSIT ---------------------- */
          COALESCE(SUM(
              CASE 
                WHEN wt.context IN ('deposit', 'crypto_deposit')
                AND w.type = 'main'
                THEN wt.amount 
                ELSE 0
              END
          ), 0) AS total_deposit,

          /* ---------------------- TOTAL WITHDRAWAL ---------------------- */
          COALESCE(SUM(
              CASE 
                WHEN wt.context IN ('withdrawal', 'crypto_withdrawal')
                AND w.type = 'main'
                THEN wt.amount 
                ELSE 0
              END
          ), 0) AS total_withdrawal,

          /* ---------------------- WEEKLY PROFIT / LOSS ---------------------- */
          COALESCE(SUM(
              CASE
                WHEN wt.type = 'debit'
                AND w.type = 'main'
                  AND wt.context IN ('won','bet','lost','bet_refund','rollback','casino_bet','casino_bet_refund','casino_win')
                THEN -wt.amount

                WHEN wt.type = 'credit'
                AND w.type = 'main'
                  AND wt.context IN ('won','bet','lost','bet_refund','rollback','casino_bet','casino_bet_refund','casino_win')
                THEN wt.amount
                ELSE 0
              END
          ), 0) AS user_profit_loss,

          /* ---------------------- BONUS TOTAL ---------------------- */
          COALESCE(SUM(
              CASE WHEN wt.context = 'bonus' THEN wt.amount ELSE 0 END
          ), 0) AS total_bonus

      FROM "user" u
      LEFT JOIN wallets w 
          ON w.user_id = u.id

      LEFT JOIN wallet_transactions wt
          ON wt.wallet_id = w.id
          AND wt.status IN ('approved', 'confirmed')
          AND wt.timestamp::date BETWEEN (CURRENT_DATE - INTERVAL '7 days')
                                  AND (CURRENT_DATE - INTERVAL '1 day')

      WHERE u.deleted_at IS NULL
      GROUP BY u.id, u.username
      WITH DATA;
    `);
    // AND wt.timestamp::date BETWEEN (CURRENT_DATE - INTERVAL '7 days')
    //                                AND (CURRENT_DATE - INTERVAL '1 day')

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_weekly_summary_user_id 
      ON user_weekly_summary_mv (user_id);
    `);

    console.log(
      "✅ Materialized view 'user_weekly_summary_mv' created successfully!",
    );
  } catch (error) {
    console.error(
      "❌ Failed to create materialized view 'user_weekly_summary_mv':",
      error,
    );
  }
}
