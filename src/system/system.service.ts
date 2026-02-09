import { Injectable } from '@nestjs/common';
import { Prisma, Setting, SettingOption, SystemSetting } from '@prisma/client';
import { UserType, UtilsService } from '@Common';
import { SettingsService } from '../settings';
import _ from 'lodash';

@Injectable()
export class SystemService {
  constructor(
    private readonly utilsService: UtilsService,
    private readonly settingsService: SettingsService,
  ) {}

  async getAllSettings(
    mappedTo?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options?: { userContext?: UserType },
  ): Promise<
    (Setting & {
      options: SettingOption[];
      selection: Prisma.JsonValue | null;
    })[]
  > {
    return await this.settingsService.getSystemSettings(mappedTo);
  }

  async updateSettings(
    data: {
      settingId: number;
      enable?: boolean;
      selection?: string;
      selections?: string[];
    }[],
  ): Promise<SystemSetting[]> {
    for (const item of data) {
      if (item.settingId === 1) {
        const turnover = Number(item.selection);
        if (isNaN(turnover) || turnover <= 0) {
          throw new Error('Active User Criteria cannot be 0 or less than 0');
        }
      }
    }

    return await this.utilsService.batchable(
      data,
      async (item) =>
        await this.settingsService.updateSystemSetting({
          settingId: item.settingId,
          enable: item.enable,
          selection: item.selection,
          selections: item.selections,
        }),
    );
  }

  async getTurnoverSettings() {
    const systemSettings = _.keyBy(await this.getAllSettings(), 'mappedTo');

    const active_user = systemSettings['active_user.minimum_turnover'];
    const platform = systemSettings['deduction.platform'];
    const deposit = systemSettings['deduction.deposit'];
    const withdrawal = systemSettings['deduction.withdrawal'];

    return {
      active_user: active_user.selection
        ? Number(active_user.selection)
        : Number(active_user.default),
      platform: platform.selection
        ? Number(platform.selection)
        : Number(platform.default),
      deposit: deposit.selection
        ? Number(deposit.selection)
        : Number(deposit.default),
      withdrawal: withdrawal.selection
        ? Number(withdrawal.selection)
        : Number(withdrawal.default),
    };
  }

  async getTurnoverSettingsDetails() {
    const systemSettings = _.keyBy(await this.getAllSettings(), 'mappedTo');

    return {
      active_user: systemSettings['active_user.minimum_turnover'],
      platform: systemSettings['deduction.platform'],
      deposit: systemSettings['deduction.deposit'],
      withdrawal: systemSettings['deduction.withdrawal'],
    };
  }

  async getconvertionrate() {
    const systemSettings = _.keyBy(await this.getAllSettings(), 'mappedTo');

    const conversionrate = systemSettings['payment.conversionrate'];

    return {
      conversionrate: conversionrate.selection
        ? Number(conversionrate.selection)
        : Number(conversionrate.default),
    };
  }

  async getconvertionrateDetails() {
    const systemSettings = _.keyBy(await this.getAllSettings(), 'mappedTo');
    return {
      conversionrate: systemSettings['payment.conversionrate'],
    };
  }
}
