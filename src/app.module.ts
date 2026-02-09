import { Module } from '@nestjs/common';
// import { SentryModule } from '@sentry/nestjs/setup';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MulterModule } from '@nestjs/platform-express';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { CommonModule, StorageService } from '@Common';
import { AppController } from './app.controller';
import { AppCacheInterceptor } from './app-cache.interceptor';
import { PrismaModule } from './prisma';
import { AuthModule } from './auth';
import { RedisModule } from './redis';
import { CaptchaModule } from './captcha/captcha.module';
import { MfaModule } from './multi-factor-authentication/mfa.module';
import { WalletsModule } from './wallets/wallets.module';
import { CasinoModule } from './casino/casino.module';
import { TransactionsModule } from './transactions/transactions.module';
import { BannersModule } from './banners';
import { NotificationModule } from './notification';
import { RoleModule } from './role/role.module';
import { CustomSeedModule } from './custom-seed/custom-seed.module';
import { ContactSupportModule } from './contact';
import { BankerModule } from './banker/banker.module';
import { SportsProviderModule } from './sports-provider/sports-provider.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { EventsModule } from './events/events.module';
import { MarketModule } from './market/market.module';
import { MqttModule } from './mqtt/mqtt.module';
import { OddsModule } from './odds/odds.module';
import { FixtureModule } from './fixture/fixture.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { PaymentModule } from './payment';
import { CryptoModule } from './crypto/crypto.module';
import { MarketMapperModule } from './market-mapper/market-mapper.module';
import { AffiliateModule } from './affiliate/affiliate.module';
import { KycModule } from './kyc/kyc.module';
import { BetconfigModule } from './betconfig/betconfig.module';
import { WebhookModule } from './webhook/webhook.module';
import { BetResultModule } from './bet-result/bet-result.module';
import { SportsOrchestratorProcessorModule } from './sports-orchestrator-processor/sports-orchestrator-processor.module';
import { BetModule } from './bet/bet.module';
import { StakesetModule } from './stakeset/stakeset.module';
import { ExposureModule } from './exposure/exposure.module';
import { SportsPermissionModule } from './sports-permission/sports-permission.module';
import { ExportsModule } from './exports';
import { BonusModule } from './bonus/bonus.module';
import { TurnoverModule } from './turnover/turnover.module';
import { ReportsModule } from './reports/reports.module';
import { BussinessReportModule } from './bussiness-report/bussiness-report.module';
import { ActivityModule } from './activity';
import { UpiModule } from './upi/upi.module';
import { SystemModule } from './system';
import { DashboardModule } from './dashboard/dashboard.module';
import { MyWalletModule } from './my-wallet/my-wallet.module';
import { KafkaModule } from './kafka/kafka.module';
import { BankModule } from './bank';
import { AlertModule } from './alert/alert.module';

@Module({
  imports: [
    MulterModule.registerAsync({
      useFactory: (storageService: StorageService) => ({
        ...storageService.defaultMulterOptions,
      }),
      inject: [StorageService],
    }),
    CacheModule.register({ isGlobal: true, ttl: 1 }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    CommonModule,
    PrismaModule,
    RedisModule,
    AuthModule,
    CaptchaModule,
    MfaModule,
    WalletsModule,
    CasinoModule,
    TransactionsModule,
    BannersModule,
    NotificationModule,
    RoleModule,
    CustomSeedModule,
    ContactSupportModule,
    ExportsModule,
    BankerModule,
    SportsProviderModule,
    CompetitionsModule,
    EventsModule,
    MarketModule,
    // MqttModule,
    OddsModule,
    FixtureModule,
    CatalogueModule,
    PaymentModule,
    CryptoModule,
    MarketMapperModule,
    AffiliateModule,
    ReportsModule,
    KycModule,
    BetconfigModule,
    WebhookModule,
    BetResultModule,
    SportsOrchestratorProcessorModule,
    BetModule,
    StakesetModule,
    ExposureModule,
    SportsPermissionModule,
    BonusModule,
    TurnoverModule,
    BussinessReportModule,
    ActivityModule,
    UpiModule,
    BankModule,
    SystemModule,
    DashboardModule,
    MyWalletModule,
    BankModule,
    KafkaModule,
    AlertModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AppCacheInterceptor,
    },
  ],
})
export class AppModule {}
