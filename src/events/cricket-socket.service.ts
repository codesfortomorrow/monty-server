/* eslint-disable @typescript-eslint/no-var-requires */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { CricketScoreCard } from './events.type';
import { RedisService } from 'src/redis';

const WS = require('ws');

const REDIS_KEY = {
  active: (id: string) => `cricket:active:${id}`,
  score: (id: string) => `cricket:score:${id}`,
  running: () => `cricket:socket:running`,
  reconnect: (id: string) => `cricket:reconnect:${id}`,
};

const ACTIVE_TTL = 60; // seconds
const SYNC_INTERVAL_MS = 5_000; // 5 seconds
const HB_INTERVAL_MS = 15_000; // 15 seconds (TCP keep-alive only)
const RECONNECT_TTL = 8; // seconds
const SCORE_TTL = 300; // seconds

@Injectable()
export class CricketSocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CricketSocketService.name);

  private readonly sockets = new Map<string, any>();
  private readonly heartbeats = new Map<string, NodeJS.Timeout>();
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    await this.redis.client.del(REDIS_KEY.running());
    this.logger.log('CricketSocketService started — stale running set cleared');

    this.syncTimer = setInterval(() => this.syncLoop(), SYNC_INTERVAL_MS);
    this.logger.log(
      `Sync loop started (interval=${SYNC_INTERVAL_MS}ms, activeTTL=${ACTIVE_TTL}s)`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('CricketSocketService shutting down');
    if (this.syncTimer) clearInterval(this.syncTimer);

    // Close all sockets sequentially — important for clean unsubscribe
    for (const id of [...this.sockets.keys()]) await this.closeSocket(id);
    await this.redis.client.del(REDIS_KEY.running());
  }

  async markEventActive(eventId: string): Promise<void> {
    if (!eventId) return;
    // SETEX resets the TTL on every call — sliding window behaviour
    await this.redis.client.setex(
      REDIS_KEY.active(eventId),
      ACTIVE_TTL,
      String(Date.now()),
    );
  }

  async getScoreCard(eventId: string): Promise<CricketScoreCard | null> {
    const raw = await this.redis.client.get(REDIS_KEY.score(eventId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async syncLoop(): Promise<void> {
    try {
      const [activeIds, runningIds] = await Promise.all([
        this.scanActiveEventIds().then((ids) => new Set(ids)),
        Promise.resolve([...this.sockets.keys()]),
      ]);

      // Open sockets for newly active events
      for (const id of activeIds) {
        if (!this.sockets.has(id)) {
          this.logger.log(`[SYNC] New active event ${id} — opening socket`);
          await this.openSocket(id);
        }
      }

      // Close sockets for events with no active clients
      for (const id of runningIds) {
        if (!activeIds.has(id)) {
          this.logger.log(
            `[SYNC] Presence expired for event ${id} — closing socket`,
          );
          await this.closeSocket(id);
        }
      }
    } catch (err) {
      this.logger.error('[SYNC] Error during sync loop', err);
    }
  }

  private async scanActiveEventIds(): Promise<string[]> {
    const prefix = 'cricket:active:';
    const ids: string[] = [];
    let cursor = '0';

    do {
      const [next, keys] = await this.redis.client.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        100,
      );
      cursor = next;
      ids.push(...keys.map((k) => k.slice(prefix.length)));
    } while (cursor !== '0');

    return ids;
  }

  // ── Socket lifecycle ───────────────────────────────────────────────────────

  private async openSocket(eventId: string): Promise<void> {
    if (this.sockets.has(eventId)) return;

    // Distributed lock (multi-instance safe)
    const lock = await this.redis.client.set(
      `cricket:socket:lock:${eventId}`,
      '1',
      'EX',
      5,
      'NX',
    );

    if (!lock) return;

    if (this.sockets.has(eventId)) {
      this.logger.warn(
        `[OPEN] Socket already exists for ${eventId} — skipping`,
      );
      return;
    }

    this.logger.log(`[OPEN] Connecting for event ${eventId}`);
    const ws = new WS('ws://crisock.starrexch.me');

    this.sockets.set(eventId, ws);
    await this.redis.client.sadd(REDIS_KEY.running(), eventId);

    ws.on('open', () => this.onOpen(eventId, ws));
    // Register the handler — data comes in as a plain string from this provider
    ws.on('message', (data: string) => this.onMessage(eventId, data));
    ws.on('close', (code: number, reason: Buffer) =>
      this.onClose(eventId, code, reason),
    );
    ws.on('error', (err: Error) => this.onError(eventId, err));
    ws.on('ping', () => this.logger.debug(`[PING] server→us ${eventId}`));
    ws.on('pong', () => this.logger.debug(`[PONG] us→server ${eventId}`));
  }

  private async closeSocket(eventId: string): Promise<void> {
    this.logger.log(`[CLOSE] Closing socket for event ${eventId}`);
    this.stopHeartbeat(eventId);

    const ws = this.sockets.get(eventId);
    if (ws) {
      this.sockets.delete(eventId);
      ws.terminate();
    }

    await this.redis.client.srem(REDIS_KEY.running(), eventId);
    this.logger.log(`[CLOSE] Socket closed for event ${eventId}`);
  }

  // ── WebSocket event handlers ───────────────────────────────────────────────

  private onOpen(eventId: string, ws: any): void {
    this.logger.log(`[CONNECTED] Event ${eventId} — sending subscribe`);

    const payload = JSON.stringify({
      type: 'subscribe',
      oldgmid: Number(eventId),
    });
    ws.send(payload, (err?: Error) => {
      if (err)
        this.logger.error(`[SUBSCRIBE] Failed for event ${eventId}`, err);
      else this.logger.log(`[SUBSCRIBE] OK for event ${eventId}`);
    });

    this.startHeartbeat(eventId, ws);
  }

  private async onMessage(eventId: string, data: string): Promise<void> {
    const isActive = await this.redis.client.exists(REDIS_KEY.active(eventId));

    if (!isActive) {
      this.logger.log(`[AUTO-CLOSE] TTL expired for ${eventId}`);
      await this.closeSocket(eventId);
      return;
    }

    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(data);
    } catch {
      this.logger.error(
        `[MSG] JSON parse failed [${eventId}]: ${data.slice(0, 200)}`,
      );
      return;
    }

    if (!parsed || typeof parsed !== 'object') {
      this.logger.warn(`[MSG] Non-object payload [${eventId}]`);
      return;
    }

    try {
      const scoreCard = this.buildScoreCard(parsed, eventId);
      await this.redis.client.setex(
        REDIS_KEY.score(eventId),
        SCORE_TTL,
        JSON.stringify(scoreCard),
      );
      this.logger.debug(
        `🏏 [${eventId}] ${scoreCard.matchName} — ${scoreCard.status.message}`,
      );
    } catch (err) {
      this.logger.error(
        `[MSG] Failed to build/store scorecard [${eventId}]`,
        err,
      );
    }
  }

  private async onClose(
    eventId: string,
    code: number,
    reason: Buffer,
  ): Promise<void> {
    const reasonStr = reason?.toString() || 'none';
    this.logger.warn(
      `[CLOSE] Event ${eventId} code=${code} reason="${reasonStr}"`,
    );
    this.stopHeartbeat(eventId);

    if (!this.sockets.has(eventId)) {
      this.logger.log(
        `[CLOSE] Intentional close for ${eventId} — no reconnect`,
      );
      return;
    }

    // Unexpected close — clean up local state and attempt reconnect
    this.logger.warn(
      `[CLOSE] Unexpected close for ${eventId} — scheduling reconnect`,
    );
    this.sockets.delete(eventId);
    await this.redis.client.srem(REDIS_KEY.running(), eventId);
    await this.scheduleReconnect(eventId);
  }

  private onError(eventId: string, err: Error): void {
    // Errors are always followed by a close event — reconnect is handled there.
    this.logger.error(`[ERROR] Event ${eventId}: ${err.message}`, err.stack);
  }

  // ── Heartbeat ──────────────────────────────────────────────────────────────

  private startHeartbeat(eventId: string, ws: any): void {
    this.stopHeartbeat(eventId); // Defensive: clear any existing timer

    const timer = setInterval(() => {
      if (ws.readyState !== WS.OPEN) {
        this.logger.warn(
          `[HB] Skipped ping — socket not open [${eventId}] state=${ws.readyState}`,
        );
        return;
      }
      ws.ping();
      this.logger.debug(`[HB] Ping → ${eventId}`);
    }, HB_INTERVAL_MS);

    this.heartbeats.set(eventId, timer);
  }

  private stopHeartbeat(eventId: string): void {
    const timer = this.heartbeats.get(eventId);
    if (timer) {
      clearInterval(timer);
      this.heartbeats.delete(eventId);
    }
  }

  private async scheduleReconnect(eventId: string): Promise<void> {
    const acquired = await this.redis.client.set(
      REDIS_KEY.reconnect(eventId),
      '1',
      'EX',
      RECONNECT_TTL,
      'NX',
    );

    if (!acquired) {
      this.logger.debug(
        `[RECONNECT] Mutex held for ${eventId} — another pod is reconnecting`,
      );
      return;
    }

    this.logger.log(
      `[RECONNECT] Will retry event ${eventId} in ${RECONNECT_TTL}s`,
    );

    setTimeout(async () => {
      // Re-check: clients may have gone away while the socket was down
      const stillActive = await this.redis.client.exists(
        REDIS_KEY.active(eventId),
      );
      if (!stillActive) {
        this.logger.log(
          `[RECONNECT] No active clients for ${eventId} — skipping`,
        );
        return;
      }

      // Guard against duplicate — sync loop may have already reopened it
      if (this.sockets.has(eventId)) {
        this.logger.log(
          `[RECONNECT] Socket already open for ${eventId} — skipping`,
        );
        return;
      }

      this.logger.log(`[RECONNECT] Reconnecting event ${eventId}`);
      await this.openSocket(eventId);
    }, RECONNECT_TTL * 1_000);
  }

  // ── Score card builder ─────────────────────────────────────────────────────

  buildScoreCard(data: any, eventId: string): CricketScoreCard {
    return {
      matchId: eventId,
      matchName: `${data.spnnation1 ?? ''} vs ${data.spnnation2 ?? ''}`.trim(),
      betfairEventId: eventId,

      team1: {
        name: data.spnnation1?.trim() ?? '',
        score: data.score1 ?? '',
        runRate: Number(data.spnrunrate1) || null,
        requiredRate: Number(data.spnreqrate1) || null,
        isBatting: data.activenation1 === '1',
      },

      team2: {
        name: data.spnnation2?.trim() ?? '',
        score: data.score2 ?? '',
        runRate: Number(data.spnrunrate2) || null,
        requiredRate: Number(data.spnreqrate2) || null,
        isBatting: data.activenation2 === '1',
      },

      lastBalls: Array.isArray(data.balls) ? data.balls : [],

      innings: {
        currentOver: this.parseCurrentOver(data.score1, data.score2),
        ballRunningStatus: data.spnballrunningstatus ?? '',
        day: data.dayno ?? '',
      },

      status: {
        isFinished: data.isfinished === '1',
        message: data.spnmessage ?? '',
      },

      updatedAt: Date.now(),
    };
  }

  parseCurrentOver(score1?: string, score2?: string): string | undefined {
    return (score1?.match(/\((.*?)\)/) ?? score2?.match(/\((.*?)\)/))?.[1];
  }
}
