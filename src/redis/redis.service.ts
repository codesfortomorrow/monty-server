import { Redis } from 'ioredis';
import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '@Common';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  client: Redis;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async onModuleInit() {
    this.client = new Redis(this.configService.get('REDIS_URI'), {
      lazyConnect: true,
    });

    this.client.on('error', (err: Error) => {
      throw err;
    });

    await this.client.connect();
  }

  async onApplicationShutdown() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async deleteKeysByPattern(pattern: string) {
    let cursor = '0';
    do {
      const [newCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        1000,
      );
      cursor = newCursor;

      if (keys.length) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  async scanKeys(pattern: string): Promise<string[]> {
    let cursor = '0';
    const keys: string[] = [];

    do {
      const [nextCursor, batch] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        1000,
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }
}
