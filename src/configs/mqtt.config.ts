import { registerAs } from '@nestjs/config';

export const mqttConfigFactory = registerAs('mqtt', () => ({
  MQTT_HOST: process.env.MQTT_HOST || '45.194.2.76',
  port: parseInt(process.env.MQTT_PORT || '1883', 10) || 1883,
}));
