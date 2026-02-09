import { registerAs } from '@nestjs/config';
import { Environment } from '@Common';

export interface AppConfig {
  env: Environment;
  domain: string;
  appWebUrl: string;
  adminWebUrl: string;
  serverUrl: string;
  appUri: string;
  httpPayloadMaxSize: string;
  platformName: string;
  demoUserPassword: string;
  userTypes: Record<
    string,
    {
      level: number;
      description: string;
    }
  >;
}

export const appConfigFactory = registerAs<AppConfig>('app', () => ({
  env: process.env.APP_ENV as Environment,
  domain: process.env.DOMAIN as string,
  appWebUrl: process.env.APP_WEB_URL as string,
  adminWebUrl: process.env.ADMIN_WEB_URL as string,
  serverUrl: process.env.SERVER_URL as string,
  appUri: process.env.APP_URI as string,
  httpPayloadMaxSize: '20mb',
  platformName: process.env.PLATFORM_NAME as string,
  demoUserPassword: process.env.DEMO_USER_PASSWORD || 'Demo@123',
  userTypes: {
    ADMIN: { level: 1, description: 'Manages most platform operations' },
    'SUPER MASTER': { level: 2, description: 'Manages masters' },
    MASTER: { level: 3, description: 'Manages user' },
    USER: { level: 4, description: 'END USER' },
    DEMO: { level: 5, description: 'DEMO USER' },
    'RESULT MANAGER': {
      level: 6,
      description: 'Manages and publishes results',
    },
  },
}));
