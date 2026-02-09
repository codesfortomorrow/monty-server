import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContactType, Prisma } from '@prisma/client';
import { FindAllContactSupportDto } from './dto/get-all-contact.request';
import { CreateContactSupportDto, UpdateContactSupportDto } from './dto';

@Injectable()
export class ContactSupportService {
  constructor(private readonly prisma: PrismaService) {}

  private formatNumber(raw?: string | null) {
    if (!raw) return null;
    const digits = raw.replace(/[^\d+]/g, '');
    return digits.length === 0 ? null : digits;
  }

  private buildWhatsAppUrl(number?: string | null) {
    if (!number) return null;
    const cleaned = number.replace(/^\+/, '');
    return `https://wa.me/${cleaned}`;
  }

  private buildTelegramUrl(username?: string | null) {
    if (!username) return null;
    return `https://t.me/${username}`;
  }

  private buildImoUrl(id?: string | null) {
    if (!id) return null;
    return `https://imo.im/${id}`;
  }

  private enrich(record: any) {
    let contactUrl: string | null = null;

    switch (record.type as ContactType) {
      case ContactType.Whatsapp:
        contactUrl = this.buildWhatsAppUrl(record.number);
        break;
      case ContactType.Telegram:
        contactUrl = this.buildTelegramUrl(record.number);
        break;
      case ContactType.imo:
        contactUrl = this.buildImoUrl(record.number);
        break;
    }

    return { ...record, contactUrl };
  }

  async create(data: CreateContactSupportDto) {
    if (!data.number?.trim()) throw new Error('Number is required');

    const existing = await this.prisma.contactSupport.findFirst({
      where: {
        type: data.type,
        number: data.number.trim(),
      },
    });

    if (existing) {
      throw new Error('Contact already exists');
    }

    const contact = await this.prisma.contactSupport.create({
      data: {
        label: data.label?.trim() || null,
        type: data.type,
        number: data.number.trim(),
        isActive: false,
      },
    });

    return this.enrich(contact);
  }

  async findAll(options: FindAllContactSupportDto) {
    let take: number | undefined;
    let skip: number | undefined;

    if (options.page && options.limit) {
      options.page = options.page < 1 ? 1 : options.page;
      take = options.limit;
      skip = (options.page - 1) * options.limit;
    }

    const where: Prisma.ContactSupportWhereInput = {};
    if (options.type) where.type = options.type;

    const total = await this.prisma.contactSupport.count({ where });

    const records = await this.prisma.contactSupport.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take,
    });

    const response = records.map((r) => this.enrich(r));

    const totalPage = Math.ceil(
      total / (take && take > 0 ? take : total < 1 ? 1 : total),
    );

    const pagination = {
      currentPage: options.page ?? 1,
      totalItems: total,
      totalPage,
      limit: options.limit ?? total,
    };

    return {
      data: response,
      pagination,
    };
  }

  // async toggleActive(id: number) {
  //   return this.prisma.$transaction(async (tx) => {
  //     const contact = await tx.contactSupport.findUnique({
  //       where: { id },
  //     });

  //     if (!contact) {
  //       throw new Error('Contact not found');
  //     }

  //     // If already active → deactivate it
  //     if (contact.isActive) {
  //       return tx.contactSupport.update({
  //         where: { id },
  //         data: { isActive: false },
  //       });
  //     }

  //     // If inactive → activate it and deactivate other items of the same type
  //     await tx.contactSupport.updateMany({
  //       where: { type: contact.type },
  //       data: { isActive: false },
  //     });

  //     return tx.contactSupport.update({
  //       where: { id },
  //       data: { isActive: true },
  //     });
  //   });
  // }

  async setActiveStatus(id: number, isActive: boolean) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const contact = await tx.contactSupport.findUnique({
          where: { id },
        });

        if (!contact) {
          return {
            status: 400,
            message: 'Contact not found',
          };
        }

        if (!isActive) {
          await tx.contactSupport.update({
            where: { id },
            data: { isActive: false },
          });

          return {
            status: 200,
            message: 'Contact deactivated successfully',
          };
        }

        const alreadyActive = await tx.contactSupport.findFirst({
          where: {
            type: contact.type,
            isActive: true,
            NOT: { id },
          },
        });

        if (alreadyActive) {
          return {
            status: 400,
            message: `Another ${contact.type} contact is already active. Please deactivate it first.`,
          };
        }

        await tx.contactSupport.update({
          where: { id },
          data: { isActive: true },
        });

        return {
          status: 200,
          message: 'Contact activated successfully',
        };
      });
    } catch (error) {
      console.error('Error in setActiveStatus:', error);

      return {
        status: 500,
        message: 'Internal server error',
      };
    }
  }

  async findActive() {
    const contacts = await this.prisma.contactSupport.findMany({
      where: { isActive: true },
    });

    const whatsapp = contacts.find((c) => c.type === ContactType.Whatsapp);
    const telegram = contacts.find((c) => c.type === ContactType.Telegram);
    const imo = contacts.find((c) => c.type === ContactType.imo);

    return {
      whatsapp: whatsapp ? this.buildWhatsAppUrl(whatsapp.number) : null,
      telegram: telegram ? this.buildTelegramUrl(telegram.number) : null,
      imo: imo ? this.buildImoUrl(imo.number) : null,
    };
  }

  async findOne(id: number) {
    const record = await this.prisma.contactSupport.findUnique({
      where: { id },
    });
    if (!record) throw new Error('Contact support entry not found');
    return this.enrich(record);
  }

  async update(id: number, data: UpdateContactSupportDto) {
    const contact = await this.prisma.contactSupport.findUnique({
      where: { id },
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    if (data.number !== undefined && !data.number.trim()) {
      throw new Error('Number cannot be empty');
    }

    const updated = await this.prisma.contactSupport.update({
      where: { id },
      data: {
        label: data.label?.trim() ?? contact.label,
        type: data.type ?? contact.type,
        number: data.number?.trim() ?? contact.number,
      },
    });

    return this.enrich(updated);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.contactSupport.delete({ where: { id } });
    return { success: true };
  }
}
