import { Prisma, SettingContext, SettingType } from '@prisma/client';

export const settings: Prisma.SettingCreateInput[] = [
  {
    context: SettingContext.System,
    mappedTo: 'active_user.minimum_turnover',
    text: 'Minimum Turnover',
    description:
      'Minimum turnover required for a player to be considered active',
    type: SettingType.SingleSelect,
    isDefinedOptions: false,
    default: 3000,
  },
  {
    context: SettingContext.System,
    mappedTo: 'deduction.platform',
    text: 'Platform Deduction',
    description: 'Percentage deduction from affiliate commission',
    type: SettingType.SingleSelect,
    isDefinedOptions: false,
    default: 18,
  },
  {
    context: SettingContext.System,
    mappedTo: 'deduction.deposit',
    text: 'Deposit Charge',
    description: 'Percentage charge applied on deposits',
    type: SettingType.SingleSelect,
    isDefinedOptions: false,
    default: 2,
  },
  {
    context: SettingContext.System,
    mappedTo: 'deduction.withdrawal',
    text: 'Withdrawal Charge',
    description: 'Percentage charge applied on withdrawals',
    type: SettingType.SingleSelect,
    isDefinedOptions: false,
    default: 1.5,
  },
  {
    context: SettingContext.System,
    mappedTo: 'payment.conversionrate',
    text: 'Conversion Rate',
    description: 'Conversion rate for currency exchange',
    type: SettingType.SingleSelect,
    isDefinedOptions: false,
    default: 126,
  },
];
