import { ContactType } from '@prisma/client';

const PHONE_REGEX = /^\+?[1-9]\d{6,14}$/;

// Telegram / IMO usernames (5–32 chars)
const USERNAME_REGEX = /^[a-zA-Z0-9_]{5,32}$/;

// Extract Telegram username from URL or @username
function extractTelegramUsername(input: string): string | null {
  if (!input) return null;
  const username = input
    .replace(/^https?:\/\/t\.me\//, '')
    .replace(/^t\.me\//, '')
    .replace(/^@/, '')
    .trim();
  return USERNAME_REGEX.test(username) ? username : null;
}

// Extract IMO ID from URL or @id
function extractImoId(input: string): string | null {
  if (!input) return null;
  const id = input
    .replace(/^imo:\/\/chat\//, '')
    .replace(/^https?:\/\/imo\.im\//, '')
    .replace(/^@/, '')
    .trim();
  return USERNAME_REGEX.test(id) ? id : null;
}

// Map DTO and validate
export function mapContactSupportDto(dto: any, isCreate: boolean) {
  let number = dto.number?.trim();
  if (!number) {
    if (isCreate) throw new Error(`Number is required for type ${dto.type}`);
    else return { label: dto.label?.trim(), type: dto.type, number: undefined };
  }

  switch (dto.type) {
    case ContactType.Whatsapp:
      if (!PHONE_REGEX.test(number)) throw new Error('Invalid WhatsApp number');
      break;

    case ContactType.Telegram:
      number = extractTelegramUsername(number);
      if (!number) throw new Error('Invalid Telegram username');
      break;

    case ContactType.imo:
      number = extractImoId(number);
      if (!number) throw new Error('Invalid IMO ID');
      break;

    default:
      throw new Error('Invalid contact type');
  }

  return { label: dto.label?.trim(), type: dto.type, number };
}
