import { BaseService } from '@Common';
import { alertConfigFactory } from '@Config';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { MailService } from 'src/mail';

@Injectable()
export class AlertService extends BaseService {
  constructor(
    private readonly mailService: MailService,
    @Inject(alertConfigFactory.KEY)
    private readonly config: ConfigType<typeof alertConfigFactory>,
  ) {
    super({ loggerDefaultMeta: { service: AlertService.name } });
  }

  async notifyApiFailure(payload: {
    url: string;
    meta: object;
    error?: string;
  }) {
    try {
      await this.mailService.send({
        to: `${this.config.email}`,
        subject: `🚨 Third Party API Failure`,
        mailBodyOrTemplate: `
                  API failed after 3 retries.
  
                  ${Object.entries(payload.meta).map(
                    ([key, value]) => `${key}: ${value}`,
                  )}
                  URL: ${payload.url}
                  Error: ${payload.error ?? 'Timeout / No response'}
  
                  Time: ${new Date().toISOString()}
              `,
      });
    } catch (error) {
      this.logger.error(`Error to sending mail alert: ${error.message}`);
    }
  }

  async notifyBetResolverFailure(payload: { error?: string }) {
    try {
      await this.mailService.send({
        to: `${this.config.email}`,
        subject: `🚨 Bet Resolver Failure`,
        mailBodyOrTemplate: `
                  Bet Resolver failed and bets are stuck in processing.
  
                  Error: ${payload.error ?? 'Transaction Timeout'}
  
                  Time: ${new Date().toISOString()}
              `,
      });
    } catch (error) {
      this.logger.error(`Error to sending mail alert: ${error.message}`);
    }
  }

  async notifySportSyncFailure(payload: { meta: object; error?: string }) {
    try {
      await this.mailService.send({
        to: `${this.config.email}`,
        subject: `🚨 Sport Sync Failure`,
        mailBodyOrTemplate: `
                  Sport syncing failed.
  
                  ${Object.entries(payload.meta).map(
                    ([key, value]) => `${key}: ${value}`,
                  )}
                  Error: ${payload.error ?? 'Scheduler failed'}
  
                  Time: ${new Date().toISOString()}
              `,
      });
    } catch (error) {
      this.logger.error(`Error to sending mail alert: ${error.message}`);
    }
  }
}
