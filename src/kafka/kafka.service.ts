import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Kafka, Consumer } from 'kafkajs';
import { RedisService } from '../redis';
import { BaseService, UtilsService } from '@Common';
import { TOPIC_BATCH_CONFIG, TOPIC_MAP } from './kafka-topics';
import { EventsService } from 'src/events/events.service';
import { MarketMapperService } from 'src/market-mapper/market-mapper.service';
import { MarketProcessor } from 'src/market/market.processor';
import { targetMarkets } from 'src/utils/market';
import { kafkaConfigFactory } from '@Config';
import { ConfigType } from '@nestjs/config';
import { ResultProvider } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

export type OddsMarketOutcome = {
  id: string;
  name: string;
  odds: number | null;
  lastOdds: number | null;
  probabilities: number | null;
  active: string;
  timestamp: number;
};

export type OddsMarket = {
  id: string;
  status: string;
  specifiers?: string[];
  favourite?: 1;
  outcomes?: OddsMarketOutcome[];
  producerId: number;
  timestamp: number;
};

export type Odds = {
  market: string;
  markets: OddsMarket[];
};
interface TopicQueue {
  buffer: Map<string, any>; // 🔥 latest snapshot
  processing: boolean;
  timer?: NodeJS.Timeout;
}

@Injectable()
export class KafkaService
  extends BaseService
  implements OnModuleInit, OnModuleDestroy
{
  private kafka: Kafka;
  private consumer: Consumer;
  private activeProcessing = 0;
  private isShuttingDown = false;
  private isConnecting = false;
  private topicQueues: Record<string, TopicQueue> = {};

  private readonly CACHE_TTL = 2 * 60 * 60; // 2 hours
  private readonly CACHE_TTL_FANCY = 60; // 4 hours
  private readonly CACHE_TTL_BOOKMAKER = 60; // 24 hours
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly BASE_RECONNECT_DELAY = 1000; // 1 second

  constructor(
    private readonly utils: UtilsService,
    private readonly redis: RedisService,
    private readonly mapper: MarketMapperService,
    private readonly marketProcessor: MarketProcessor,
    private readonly eventService: EventsService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(kafkaConfigFactory.KEY)
    private readonly kafkaConfig: ConfigType<typeof kafkaConfigFactory>,
  ) {
    super({ loggerDefaultMeta: { service: KafkaService.name } });

    const clientId = this.kafkaConfig.clientId;
    if (!clientId) throw new Error('KAFKA CLIENT ID is not defined');

    const groupId = this.kafkaConfig.groupId;

    if (!groupId) throw new Error('KAFKA GROUP ID is not defined');

    this.kafka = new Kafka({
      clientId: clientId,
      brokers: ['103.189.172.165:9092', '103.189.172.165:9093'],
    });

    this.consumer = this.kafka.consumer({
      groupId: groupId,
    });
  }

  async onModuleInit() {
    if (!this.utils.isMaster()) return;

    console.log('Kafka consumer init');

    await this.consumer.connect();

    // 🔹 subscribe all topics
    for (const key of Object.keys(TOPIC_MAP)) {
      await this.consumer.subscribe({
        topic: TOPIC_MAP[key].topic,
        fromBeginning: false, // 👈 IMPORTANT
      });
    }

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;

        try {
          const payload = JSON.parse(message.value.toString());
          this.enqueueMessage(topic, payload); // ✅ FIXED
        } catch (err) {
          this.logger.error('Kafka message parse error', err);
        }
      },
    });
  }
  private enqueueMessage(topic: string, payload: any) {
    const config = TOPIC_BATCH_CONFIG[topic];
    if (!config || !payload) return;

    if (!this.topicQueues[topic]) {
      this.topicQueues[topic] = {
        buffer: new Map(),
        processing: false,
      };
    }

    const queue = this.topicQueues[topic]; //  CREATE UNIQUE KEY (event + market)

    const market = Array.isArray(payload) ? payload[0] : payload;
    if (market.timestamp)
      console.log(Date.now() - market.timestamp, 'delayaaaaaa');
    const eventId =
      market?.data?.eventID || market?.eventID || market?.data?.matchId;

    const marketName = market?.marketName;

    if (!eventId || !marketName) {
      return;
    }
    const key = `${eventId}:${marketName}`;
    queue.buffer.set(key, payload);
    if (queue.buffer.size > config.maxQueue) {
      this.logger.warn(`Queue overflow ${topic}, clearing`);
      queue.buffer.clear();
      queue.processing = false;
      return;
    }

    if (!queue.processing) {
      queue.processing = true;

      queue.timer = setTimeout(() => {
        this.processTopicQueue(topic);
      }, 50);
    }
  }

  private async processTopicQueue(topic: string) {
    const queue = this.topicQueues[topic];
    const config = TOPIC_BATCH_CONFIG[topic];
    if (!queue || !config) return;

    clearTimeout(queue.timer);
    queue.timer = undefined;

    const batch = Array.from(queue.buffer.values());
    queue.buffer.clear();

    try {
      for (const data of batch) {
        await this.handleOddsData(topic, data);
      }
    } catch (err) {
      this.logger.error(`Error processing topic ${topic}`, err);
    }

    queue.processing = false;
    if (queue.buffer.size > 0) {
      this.enqueueMessage(topic, null);
    }
  }

  private async handleOddsData(topic: string, data: any) {
    // Each message may be a single market or an array of markets
    try {
      const markets = Array.isArray(data) ? data : [data];
      if (markets.length === 0)
        this.logger.warn(`Odds are not coming, topic-${topic}`);

      for (const market of markets) {
        // const marketId =
        //   market?.data?.marketId || market?.marketId || market?.id;
        const eventID =
          market?.data?.eventID || market?.eventID || market?.data?.matchId;

        const marketName = market?.marketName || market?.data?.marektName;

        // if (!marketName) console.log(market, eventID, topic);

        // if (marketName === '1x2') {
        //   console.log(market, marketName, topic);
        // }

        const status = market?.data?.status?.toLowerCase();
        // ✅ GLOBAL CLOSED CHECK (IMPORTANT)
        if (status === 'closed') {
          this.eventEmitter.emit('market.closed', {
            marketId: market?.data?.marketId,
            eventId: eventID,
            marketName,
          });
        }

        if (
          market?.marketName === 'match odds' &&
          market?.data.status?.toLowerCase() === 'closed'
        ) {
          await this.eventService.closedEvent(market.eventId, market.sport);
          // await this.redis.client.setex(
          //   `test-updates:${market.sport}:${market.eventId}`,
          //   5 * 24 * 60 * 60,
          //   JSON.stringify(market),
          // );
        } else if (
          topic.startsWith('cricket-market-catalogue') &&
          market?.marketName?.toLowerCase() === 'fancy'
        ) {
          // const redisKey = `rawfancy:${eventID}`;
          // await this.redis.client.setex(redisKey, 60, JSON.stringify(market));
          await this.handleFancy(market);
        } else {
          if (!marketName) this.logger.warn(market);
          if (!marketName) return;
          switch (marketName.toLowerCase()) {
            case 'extramarket':
              // await this.handleExtraMarket(market);
              break;
            default:
              await this.handleOtherOdds(market);
              break;
          }
          // ✅ Store latest odds in Redis for quick lookup
          // const redisKey = `rawodds:${eventID}:${marketId}`;
          // await this.redis.client.setex(redisKey, 60, JSON.stringify(market));
        }
      }
    } catch (error) {
      this.logger.error(`Error to process Odds data: ${error}`);
    }
  }

  private async handleFancy(raw: any) {
    const mapped = this.mapper.mapFancyMarketPayload(raw);
    if (!mapped) return;

    const key = `fancy:${mapped.eventID}`;
    await this.redis.client.setex(
      key,
      this.CACHE_TTL_FANCY,
      JSON.stringify(mapped),
    );

    this.logger.debug(`[FANCY] Stored: ${mapped.eventID}`);
  }

  // ========================================
  // 2. EXTRA MARKETS
  // ========================================
  private async handleExtraMarket(raw: any) {
    const mapped = this.mapper.mapExtraMarketPayload(raw);
    if (!mapped) return;

    const { eventID } = mapped;
    const key = `extra:${eventID}`;
    await this.redis.client.setex(
      key,
      50, // 50 sec
      JSON.stringify(mapped),
    );

    this.logger.debug(`[EXTRA] Stored: ${eventID}`);
  }

  // ========================================
  // 3. OTHER ODDS (Match Odds, Bookmaker, Mini, Toss, etc.)
  // ========================================
  private async handleOtherOdds(raw: any) {
    const mapped = this.mapper.mapOddsMarketPayload(raw);
    if (!mapped) return;

    const { eventID, data } = mapped;
    // if (marketName.toLowerCase() === 'bookmaker')
    // console.log('Bookmaker data', JSON.stringify(mapped));

    // Close Event
    if (data?.status?.toLowerCase()?.startsWith('close')) {
      if (targetMarkets.includes(data?.marketName?.toLowerCase()))
        this.eventService.checkAndCloseEvent(eventID, ResultProvider.Webhook);
    } else {
      // Active Event
      if (targetMarkets.includes(data?.marketName?.toLowerCase())) {
        this.eventService.checkAndActiveEvent(eventID, ResultProvider.Webhook);
        await this.redis.client.setex(
          `fixtureodds:${eventID}:${data.marketId}`,
          5 * 60, // 5 mins
          JSON.stringify(mapped),
        );
      }
    }

    const existsKey = `market:exists:${eventID}:${data.marketId}`;
    const isExists = await this.redis.client.exists(existsKey);

    if (!isExists) {
      await this.redis.client.sadd(`market:missing:${eventID}`, data.marketId);

      // this.logger.warn(
      //   `[${data.marketType}] Market missing → queued for sync (event ${eventID})`,
      // );
    }

    // if (data.marketName?.toLowerCase() === 'bookmaker')
    //   console.log('bookmaker data 3', data);

    const ttl =
      (data.marketType?.toLowerCase() === 'bookmaker' ||
        data.marketName?.toLowerCase() === 'bookmaker') &&
      !data.marketName?.toLowerCase().startsWith('6 over bookmaker') &&
      !data.marketName?.toLowerCase().startsWith('toss')
        ? this.CACHE_TTL_BOOKMAKER
        : 60;
    await this.redis.client.setex(
      `odds:${eventID}:${data.marketId}`,
      ttl,
      JSON.stringify(mapped),
    );

    if (data.marketType?.toLowerCase() === 'bookmaker') {
      await this.redis.client.setex(
        `bookmaker:${eventID}`,
        this.CACHE_TTL_BOOKMAKER,
        '1',
      );
    }
  }

  async onModuleDestroy() {
    if (this.utils.isMaster()) {
      await this.consumer.disconnect();
    }
  }
}
