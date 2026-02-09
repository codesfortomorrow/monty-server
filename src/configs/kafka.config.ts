import { registerAs } from '@nestjs/config';

export const kafkaConfigFactory = registerAs('kafka', () => ({
  groupId: process.env.KAFKA_GROUP_ID ?? 'free2hit',
  clientId: process.env.KAFKA_CLIENT_ID ?? 'cricket-market-consumer',
}));
