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
type TopicQueue = {
  messages: any[];
  processing: boolean;
  timer?: NodeJS.Timeout;
};

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

  private readonly CACHE_TTL = 2 * 60 * 60; // 2 hours
  private readonly CACHE_TTL_FANCY = 4 * 60 * 60; // 4 hours
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly BASE_RECONNECT_DELAY = 1000; // 1 second

  private topicQueues: Record<string, TopicQueue> = {};

  constructor(
    private readonly utils: UtilsService,
    private readonly redis: RedisService,
    private readonly mapper: MarketMapperService,
    private readonly marketProcessor: MarketProcessor,
    private readonly eventService: EventsService,
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
      brokers: ['103.189.172.165:9092'],
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
    //     if(topic.startsWith('hor')){
    //   console.log(JSON.stringify(payload))
    // }
    const config = TOPIC_BATCH_CONFIG[topic];
    if (!config) return;

    if (!this.topicQueues[topic]) {
      this.topicQueues[topic] = {
        messages: [],
        processing: false,
      };
    }

    const queue = this.topicQueues[topic];

    if (queue.messages.length >= config.maxQueue) {
      // this.logger.error(`🚨 Queue overflow | topic=${topic}`);
      queue.messages.splice(0, config.maxBatch);
    }

    queue.messages.push(payload);

    if (queue.messages.length >= config.maxBatch) {
      this.processTopicQueue(topic);
      return;
    }

    if (!queue.timer) {
      queue.timer = setTimeout(() => {
        this.processTopicQueue(topic);
      }, 50);
    }
  }

  private async processTopicQueue(topic: string) {
    const queue = this.topicQueues[topic];
    const config = TOPIC_BATCH_CONFIG[topic];
    if (!queue || queue.processing || !config) return;

    queue.processing = true;
    clearTimeout(queue.timer);
    queue.timer = undefined;

    while (queue.messages.length > 0) {
      const batch = queue.messages.splice(0, config.maxBatch);

      // this.logger.log(
      //   'info',
      //   `⚙️ Processing batch | topic=${topic} | size=${batch.length}`,
      // );

      const CONCURRENCY = 20;

      for (let i = 0; i < batch.length; i += CONCURRENCY) {
        const slice = batch.slice(i, i + CONCURRENCY);
        await Promise.all(
          slice.map((data) => this.handleOddsData(topic, data)),
        );
      }
    }

    queue.processing = false;
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
        // const eventID =
        //   market?.data?.eventID || market?.eventID || market?.data?.matchId;

        const marketName = market?.marketName || market?.data?.marektName;

        // if (!marketName) console.log(market, eventID, topic);

        // if (marketName === '1x2') {
        //   console.log(market, marketName, topic);
        // }

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
  // private async handleExtraMarket(raw: any) {
  //   const mapped = this.mapper.mapExtraMarketPayload(raw);
  //   if (!mapped) return;

  //   const { eventID } = mapped;
  //   const key = `extra:${eventID}`;
  //   await this.redis.client.setex(
  //     key,
  //     50, // 50 sec
  //     JSON.stringify(mapped),
  //   );

  //   await this.marketProcessor.checkAndStorePremiumMarket(mapped);

  //   this.logger.debug(`[EXTRA] Stored: ${eventID}`);
  // }

  // ========================================
  // 3. OTHER ODDS (Match Odds, Bookmaker, Mini, Toss, etc.)
  // ========================================
  private async handleOtherOdds(raw: any) {
    const mapped = this.mapper.mapOddsMarketPayload(raw);
    if (!mapped) return;

    const { eventID, data, marketName } = mapped;
    if (marketName.toLowerCase() === 'bookmaker')
      console.log('Bookmaker data', JSON.stringify(mapped));

    // Close Event
    if (data?.status?.toLowerCase()?.startsWith('close')) {
      if (targetMarkets.includes(data?.marketName?.toLowerCase()))
        await this.eventService.checkAndCloseEvent(eventID);
    } else {
      // Active Event
      if (targetMarkets.includes(data?.marketName?.toLowerCase()))
        await this.eventService.checkAndActiveEvent(eventID);
    }

    const existsKey = `market:exists:${eventID}:${data.marketId}`;
    const isExists = await this.redis.client.exists(existsKey);

    if (!isExists) {
      await this.redis.client.sadd(`market:missing:${eventID}`, data.marketId);

      // this.logger.warn(
      //   `[${data.marketType}] Market missing → queued for sync (event ${eventID})`,
      // );
    }

    if (data.marketName?.toLowerCase() === 'bookmaker')
      console.log('bookmaker data 3', data);

    const ttl =
      data.marketType?.toLowerCase() === 'bookmaker' ||
      data.marketName?.toLowerCase() === 'bookmaker'
        ? this.CACHE_TTL_FANCY
        : 60;
    await this.redis.client.setex(
      `odds:${eventID}:${data.marketId}`,
      ttl,
      JSON.stringify(mapped),
    );

    if (data.marketType?.toLowerCase() === 'bookmaker') {
      await this.redis.client.setex(
        `bookmaker:${eventID}`,
        this.CACHE_TTL_FANCY,
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
