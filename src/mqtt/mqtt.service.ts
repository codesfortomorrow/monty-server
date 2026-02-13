import { BaseService, UtilsService } from '@Common';
import { mqttConfigFactory } from '@Config';
import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { connect, IClientOptions, MqttClient } from 'mqtt';
import { Sentry } from 'src/configs/sentry.config';
import { EventsService } from 'src/events/events.service';
import { MarketMapperService } from 'src/market-mapper/market-mapper.service';
import { MarketProcessor } from 'src/market/market.processor';
import { RedisService } from 'src/redis';
import { targetMarkets } from 'src/utils/market';

interface ReconnectState {
  attempt: number;
  timeout?: NodeJS.Timeout;
}

@Injectable()
export class MqttService
  extends BaseService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private mqttClient: MqttClient | null = null;
  private isShuttingDown = false;
  private isConnecting = false;
  private reconnectState: ReconnectState = { attempt: 0 };
  private activeProcessing = 0;

  private readonly CACHE_TTL = 2 * 60 * 60; // 2 hours
  private readonly CACHE_TTL_FANCY = 4 * 60 * 60; // 4 hours
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly BASE_RECONNECT_DELAY = 1000; // 1 second

  private readonly mqttTopics = [
    'provider/defaultProvider/marketUpdates/event/+',
    'fancyProvider/defaultProvider/marketUpdates/event/+',
    'matchupdate/updates/event/+',
  ];

  constructor(
    @Inject(mqttConfigFactory.KEY)
    private readonly config: ConfigType<typeof mqttConfigFactory>,
    private readonly utils: UtilsService,
    private readonly redis: RedisService,
    private readonly mapper: MarketMapperService,
    private readonly marketProcessor: MarketProcessor,
    private readonly eventService: EventsService,
  ) {
    super({ loggerDefaultMeta: { service: MqttService.name } });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.utils.isMaster()) {
      this.logger.info('Not master instance → skipping MQTT initialization');
      return;
    }

    // this.logger.info('Initializing MQTT client...');
    // await this.connectWithRetry();
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (!this.utils.isMaster()) return;

    // this.logger.warn(`Shutdown signal received (${signal}). Closing MQTT...`);
    // this.isShuttingDown = true;

    // // Cancel any pending reconnection
    // if (this.reconnectState.timeout) {
    //   clearTimeout(this.reconnectState.timeout);
    //   this.reconnectState.timeout = undefined;
    // }

    // if (this.mqttClient) {
    //   this.logger.info('Stopping MQTT message flow...');
    //   this.mqttClient.unsubscribe(this.mqttTopics); // unsubscribe all topics
    //   this.mqttClient.removeAllListeners('message');
    // }

    // await this.waitUntilDone();

    // if (this.mqttClient && this.mqttClient.connected) {
    //   this.logger.info('Closing MQTT connection gracefully...');

    //   return new Promise<void>((resolve, reject) => {
    //     const timeout = setTimeout(() => {
    //       this.logger.warn('MQTT disconnect timeout → forcing close');
    //       this.mqttClient?.end(true); // force close
    //       resolve();
    //     }, 10_000);

    //     this.mqttClient?.end(false, {}, (err) => {
    //       clearTimeout(timeout);
    //       if (err) {
    //         this.logger.error(`Error during MQTT disconnect ${err.message}`);
    //         reject(err);
    //       } else {
    //         this.logger.info('MQTT client disconnected cleanly');
    //         resolve();
    //       }
    //     });
    //   });
    // }
  }

  private waitUntilDone = async () => {
    const timeoutMs = 20_000;
    const start = Date.now();

    while (this.activeProcessing > 0) {
      if (Date.now() - start > timeoutMs) {
        this.logger.warn('Forced shutdown: processing did not finish in time');
        break;
      }
      this.logger.info(`Waiting... (${this.activeProcessing} tasks running)`);
      await this.utils.sleep(300);
    }
  };

  private async connectWithRetry(): Promise<void> {
    if (this.isShuttingDown || this.isConnecting) return;

    this.isConnecting = true;
    const attempt = this.reconnectState.attempt++;

    const delay = Math.min(
      this.BASE_RECONNECT_DELAY * Math.pow(2, attempt),
      30_000, // max 30 seconds
    );

    if (attempt > 0) {
      this.logger.warn(
        `Reconnecting to MQTT... Attempt ${attempt} in ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    if (this.isShuttingDown) {
      this.isConnecting = false;
      return;
    }

    try {
      await this.createMqttClient();
      this.reconnectState.attempt = 0; // reset on success
      this.logger.info('MQTT connected successfully');
    } catch (error) {
      Sentry.captureException(error);
      this.logger.error(
        `MQTT connection failed (attempt ${attempt}):`,
        error.message,
      );

      if (attempt >= this.MAX_RECONNECT_ATTEMPTS) {
        this.logger.error('Max reconnection attempts reached. Giving up.');
        this.isConnecting = false;
        return;
      }

      // Schedule next retry
      this.reconnectState.timeout = setTimeout(() => {
        this.connectWithRetry();
      }, delay);
    } finally {
      this.isConnecting = false;
    }
  }

  private async createMqttClient(): Promise<void> {
    if (this.mqttClient) {
      this.mqttClient.removeAllListeners();
      this.mqttClient.end(true);
      this.mqttClient = null;
    }

    const options: IClientOptions = {
      host: this.config.MQTT_HOST,
      port: this.config.port,
      clientId: `mqtt-service-${process.pid}-${Date.now()}`,
      clean: true,
      connectTimeout: 10_000,
      rejectUnauthorized: false,
    };

    this.mqttClient = connect(options);

    this.mqttClient.on('connect', () => this.onConnect());
    this.mqttClient.on('message', (topic, message) =>
      this.onMessage(topic, message),
    );
    this.mqttClient.on('error', (err) => this.onError(err));
    this.mqttClient.on('close', () => this.onClose());
    this.mqttClient.on('offline', () => this.onOffline());

    // Promisify connection
    return new Promise((resolve, reject) => {
      const onConnect = () => {
        this.mqttClient?.removeListener('error', onError);
        resolve();
      };
      const onError = (err: Error) => {
        this.mqttClient?.removeListener('connect', onConnect);
        reject(err);
      };

      this.mqttClient?.once('connect', onConnect);
      this.mqttClient?.once('error', onError);
    });
  }

  // private initMqttClient() {
  //   const options: IClientOptions = {
  //     host: this.config.MQTT_HOST,
  //     port: this.config.port,
  //     reconnectPeriod: 1000,
  //   };
  //   this.mqttClient = connect(options);

  //   this.mqttClient.on('connect', () => {
  //     this.logger.info('[MQTT] Connected');

  //     // ✅ Subscribe to all provider topics
  //     const topicPattern = 'provider:defaultProvider:marketUpdates';
  //     //   const topicPattern = '#';
  //     this.mqttClient.subscribe(topicPattern, { qos: 1 }, (err) => {
  //       if (err) this.logger.error('[MQTT] Failed to subscribe:', err);
  //       else
  //         this.logger.info(
  //           `[MQTT] Subscribed to topic pattern 1: ${topicPattern}`,
  //         );
  //     });
  //     // ✅ Subscribe to all provider topics for fancy
  //     const provider = 'defaultProvider';
  //     const topic = `fancyProvider:${provider}:marketUpdates`;
  //     this.mqttClient.subscribe(topic, { qos: 1 }, (err) => {
  //       if (err) this.logger.error('[MQTT] Failed to subscribe fancy:', err);
  //       else this.logger.info(`[MQTT] Subscribed to topic pattern 2: ${topic}`);
  //     });
  //     // ✅ Subscribe to all provider topics for closed market
  //     const closedMarketTopic = `matchupdate:updates`;
  //     this.mqttClient.subscribe(closedMarketTopic, { qos: 1 }, (err) => {
  //       if (err)
  //         this.logger.error(`[MQTT] Failed to subscribe closed market: ${err}`);
  //       else
  //         this.logger.info(
  //           `[MQTT] Subscribed to topic pattern 3: ${closedMarketTopic}`,
  //         );
  //     });
  //   });
  //   this.mqttClient.on('error', (err) =>
  //     this.logger.error(`[MQTT] Error: ${err}`),
  //   );
  //   this.mqttClient.on('close', () =>
  //     this.logger.info('[MQTT] Connection closed'),
  //   );

  //   // ✅ Listen for incoming odds data
  //   this.mqttClient.on('message', async (topic, message) => {
  //     try {
  //       const data = JSON.parse(message.toString());
  //       // this.logger.info(message.toString());
  //       await this.handleOddsData(topic, data);
  //     } catch (err) {
  //       this.logger.error('[MQTT] Failed to parse message', err);
  //     }
  //   });
  // }

  private onConnect(): void {
    this.logger.info('[MQTT] Connected successfully');
    console.log('MQTT Connected successfully', this.mqttTopics);
    this.mqttClient!.subscribe(this.mqttTopics, { qos: 0 }, (err, granted) => {
      if (err) {
        this.logger.error(`[MQTT] Subscription failed ${err.message}`);
      } else {
        granted?.forEach((g) =>
          this.logger.info(`[MQTT] Subscribed → ${g.topic} (QoS: ${g.qos})`),
        );
      }
    });
  }

  private onMessage(topic: string, message: Buffer): void {
    if (this.isShuttingDown) return;

    // Offload heavy processing to avoid blocking MQTT thread
    this.handleMessageAsync(topic, message).catch((err) => {
      this.logger.error(
        `[MQTT] Unhandled error in message handler ${err.message}`,
      );
    });
  }

  private async handleMessageAsync(
    topic: string,
    message: Buffer,
  ): Promise<void> {
    this.activeProcessing++;
    try {
      let data: any;
      try {
        data = JSON.parse(message.toString());
      } catch (err) {
        this.logger.warn(
          `[MQTT] Failed to parse message as JSON ${message.toString().slice(0, 200)}.
          Error: ${err.message}
          `,
        );
        return;
      }

      await this.handleOddsData(topic, data);
    } catch (err) {
      this.logger.error(
        `[MQTT] Error processing message from ${topic}`,
        err.stack,
      );
    } finally {
      this.activeProcessing--;
    }
  }

  private onError(err: Error): void {
    if (this.isShuttingDown) return;
    this.logger.error(`[MQTT] Client error ${err.message}`);
  }

  private onClose(): void {
    this.logger.warn('[MQTT] Connection closed');
    if (!this.isShuttingDown && !this.mqttClient?.connected) {
      this.logger.info('Attempting to reconnect...');
      this.connectWithRetry();
    }
  }

  private onOffline(): void {
    this.logger.warn('[MQTT] Client went offline');
  }

  /** Handle odds updates from provider */
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

        if (topic.toLowerCase().startsWith('matchupdate')) {
          await this.eventService.closedEvent(market.eventId, market.sport);
          // await this.redis.client.setex(
          //   `test-updates:${market.sport}:${market.eventId}`,
          //   5 * 24 * 60 * 60,
          //   JSON.stringify(market),
          // );
        } else if (topic.startsWith('fancy')) {
          // const redisKey = `rawfancy:${eventID}`;
          // await this.redis.client.setex(redisKey, 60, JSON.stringify(market));
          await this.handleFancy(market);
        } else {
          if (!marketName) this.logger.warn(market);
          if (!marketName) return;
          switch (marketName.toLowerCase()) {
            case 'extramarket':
              await this.handleExtraMarket(market);
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

    // await this.marketProcessor.checkAndStorePremiumMarket(mapped);

    this.logger.debug(`[EXTRA] Stored: ${eventID}`);
  }

  // ========================================
  // 3. OTHER ODDS (Match Odds, Bookmaker, Mini, Toss, etc.)
  // ========================================
  private async handleOtherOdds(raw: any) {
    const mapped = this.mapper.mapOddsMarketPayload(raw);
    if (!mapped) return;

    const { eventID, data } = mapped;

    // Close Event
    if (data?.status?.toLowerCase()?.startsWith('close')) {
      if (targetMarkets.includes(data?.marketName?.toLowerCase()))
        await this.eventService.checkAndCloseEvent(eventID);
    }
    // else {
    //   // Active Event
    //   if (targetMarkets.includes(data?.marketName?.toLowerCase()))
    //     await this.eventService.checkAndActiveEvent(eventID);
    // }

    const existsKey = `market:exists:${eventID}:${data.marketId}`;
    const isExists = await this.redis.client.exists(existsKey);

    if (!isExists) {
      await this.redis.client.sadd(`market:missing:${eventID}`, data.marketId);

      // this.logger.warn(
      //   `[${data.marketType}] Market missing → queued for sync (event ${eventID})`,
      // );
    }

    const ttl =
      data.marketType?.toLowerCase() === 'bookmaker'
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
}
