// src/mqtt/market-mapper.service.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  ExtraMarketPayload,
  FancyMarketPayload,
  OddsPayload,
} from './market.type';

@Injectable()
export class MarketMapperService {
  private readonly logger = new Logger(MarketMapperService.name);

  mapExtraMarketPayload(raw: any): ExtraMarketPayload {
    if (!raw) throw new Error('Invalid extra market payload');

    const { eventId, eventID, marketName, data } = raw;

    return {
      marketName,
      eventId: eventId || eventID,
      eventID: eventID || eventId,
      data: (data || []).map((m: any) => ({
        marketId: String(m.marketId),
        marketName: m.marketName,
        marketTime: Number(m.marketTime) || 0,
        marketType: m.marketType,
        status: m.status,
        runners: (m.runners || []).map((r: any) => ({
          runnerId: String(r.runnerId),
          runnerName: r.runnerName,
          status: r.status,
          backPrices: (r.backPrices || []).map((b: any) => ({
            price: Number(b.price),
            size: Number(b.size),
          })),
        })),
        commissionEnabled: Boolean(m.commissionEnabled),
        suspended: Boolean(m.suspended),
        disabled: Boolean(m.disabled),
        category: m.category,
        limits: {
          minBetValue: Number(m.limits?.minBetValue) || 0,
          maxBetValue: Number(m.limits?.maxBetValue) || 0,
          oddsLimit: Number(m.limits?.oddsLimit) || 0,
          currency: m.limits?.currency || 'BDT',
        },
      })),
    };
  }

  mapFancyMarketPayload(raw: any): FancyMarketPayload {
    if (!raw) throw new Error('Invalid fancy market payload');

    const { eventID, data, marketName } = raw;

    return {
      eventID: String(eventID),
      marketName,
      data: (data || []).map((m: any) => ({
        marketId: String(m.marketId),
        selectionId: String(m.SelectionId),
        runnerName: m.RunnerName,
        gameType: m.gtype || '',
        marketName: m.mname || '',
        gameStatus: m.GameStatus || '',
        gtStatus: m.gtstatus || '',
        min: Number(m.min) || 0,
        max: Number(m.max) || 0,
        remark: m.rem || '',
        ballSession: String(m.ballsess || ''),
        serialNo: Number(m.srno) || 0,
        sortPriority: m.sortPriority ? Number(m.sortPriority) : undefined,
        back: [
          { price: Number(m.BackPrice1) || 0, size: Number(m.BackSize1) || 0 },
          { price: Number(m.BackPrice2) || 0, size: Number(m.BackSize2) || 0 },
          { price: Number(m.BackPrice3) || 0, size: Number(m.BackSize3) || 0 },
        ].filter((b) => b.price || b.size), // remove empty
        lay: [
          { price: Number(m.LayPrice1) || 0, size: Number(m.LaySize1) || 0 },
          { price: Number(m.LayPrice2) || 0, size: Number(m.LaySize2) || 0 },
          { price: Number(m.LayPrice3) || 0, size: Number(m.LaySize3) || 0 },
        ].filter((l) => l.price || l.size),
      })),
    };
  }

  mapOddsMarketPayload(raw: any): OddsPayload {
    if (!raw || !raw.data) throw new Error('Invalid odds payload');

    const { eventID, data, marketName } = raw;

    const markets = Array.isArray(data) ? data : [data];
    const market = markets[0];
    if (marketName === 'BOOKMAKER') console.log('Inside mapper', data);

    return {
      eventID: String(eventID),
      marketName: String(marketName),
      data: {
        marketId: String(market.marketId),
        marketName: market.marketName || market.name || String(marketName),
        matchId: String(market.matchId),
        inplay: Boolean(market.inplay),
        marketStartTime: market.marketStartTime || market.startTime,
        status: market.status,
        marketType: market.marketType,
        totalMatched: Number(market.totalMatched) || 0,
        sportId: String(market.sportId),
        runners: (market.runners || []).map((runner: any) => ({
          selectionId: String(runner.selectionId),
          runnerName: runner.runnerName,
          status: runner.status,
          sortPriority: runner.sortPriority
            ? Number(runner.sortPriority)
            : undefined,
          back: this.normalizePriceArray(runner.back),
          lay: this.normalizePriceArray(runner.lay),
          ex: {
            availableToBack: this.normalizePriceArray(
              runner.ex?.availableToBack,
            ),
            availableToLay: this.normalizePriceArray(runner.ex?.availableToLay),
            tradedVolume: runner.ex?.tradedVolume || [],
          },
        })),
      },
    };
  }

  normalizePriceArray(arr: any[]): { price: number; size: number }[] {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p) => ({
        price: Number(p.price) || 0,
        size: Number(p.size) || 0,
      }))
      .filter((p) => p.price || p.size);
  }
}
