import { BetStatusType, BetType, SportType, StatusType } from '@prisma/client';

const sportNameToEnumMap: Record<string, SportType> = {
  Cricket: SportType.Cricket,
  Football: SportType.Football,
  Tennis: SportType.Tennis,
  Basketball: SportType.Basketball,
  HorseRacing: SportType.HorseRacing,
  Greyhound: SportType.Greyhound,
  Soccer: SportType.Soccer,
  Other: SportType.Other,
};

export const getSportEnum = (name: string): SportType => {
  const normalized = name.trim().toLowerCase();
  const matched = Object.entries(sportNameToEnumMap).find(
    ([key]) => key.toLowerCase() === normalized,
  );
  return matched ? matched[1] : SportType.Other;
};

export const getSportId = (
  sports: Record<string, number>,
  sportName: string,
): number | null => {
  const normalized = sportName.trim().toLowerCase();
  if (!normalized) return null;

  // Convert both keys and input to lowercase for case-insensitive matching
  const key = Object.keys(sports).find((k) => k.toLowerCase() === normalized);

  return key ? sports[key as keyof typeof sports] : null;
};

const statusNameToEnumMap: Record<string, StatusType> = {
  Upcoming: StatusType.Upcoming,
  Live: StatusType.Live,
  Finished: StatusType.Finished,
  Cancelled: StatusType.Cancelled,
  Open: StatusType.Open,
  Closed: StatusType.Closed,
  Void: StatusType.Void,
  Active: StatusType.Active,
  Inactive: StatusType.Inactive,
};

export const getStatusEnum = (name: string): StatusType => {
  if (!name) return StatusType.Inactive; // default fallback if needed

  const normalized = name.trim().toLowerCase();
  const matched = Object.entries(statusNameToEnumMap).find(
    ([key]) => key.toLowerCase() === normalized,
  );

  return matched ? matched[1] : StatusType.Void;
};

const betStatusDbMap: Record<string, string> = {
  PENDING: 'pending',
  WON: 'won',
  LOST: 'lost',
  VOIDED: 'voided',
  CANCELLED: 'cancelled',
  ROLLBACK: 'rollback',
};

export function getDbBetStatus(value: string): string | null {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  const matched = Object.entries(betStatusDbMap).find(
    ([key]) => key.toLowerCase() === normalized,
  );

  return matched ? matched[1] : null;
}

const betStatusMap: Record<string, BetStatusType> = {
  pending: BetStatusType.Pending,
  won: BetStatusType.Won,
  lost: BetStatusType.Lost,
  voided: BetStatusType.Voided,
  cancelled: BetStatusType.Cancelled,
  rollback: BetStatusType.Rollback,
};

export function getBetStatusEnum(value: string): BetStatusType {
  const normalized = value.trim().toLowerCase();
  const matched = Object.entries(betStatusMap).find(
    ([key]) => key.toLowerCase() === normalized,
  );

  return matched ? matched[1] : BetStatusType.Pending;
}

const betTypeNameToEnumMap: Record<string, BetType> = {
  Back: BetType.Back,
  Lay: BetType.Lay,
  All: BetType.All,
};

export const getBetTypeEnum = (name: string): BetType => {
  if (!name) return BetType.Back; // default fallback if needed

  const normalized = name.trim().toLowerCase();
  const matched = Object.entries(betTypeNameToEnumMap).find(
    ([key]) => key.toLowerCase() === normalized,
  );

  return matched ? matched[1] : BetType.Back;
};
