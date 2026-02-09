import { PrismaClient } from '@prisma/client';
import { AppConfig, appConfigFactory } from '../../src/configs/app.config';

const prisma = new PrismaClient();

export async function seedPrivilegesAndOwnerRole(id?: bigint) {
  const appConfig = appConfigFactory() as unknown as AppConfig;

  const rolesConfig = appConfig.userTypes;

  // Step 1️⃣ — Seed Privileges
  const privileges = [
    {
      permissions: 'Dashboard',
      description: 'Access to dashboard overview and analytics',
      access: {
        read: { status: true, details: 'Able to view the complete dashboards' },
      },
    },
    {
      permissions: 'Users',
      description:
        'Allows viewing and managing all users — view, edit, block/unblock, reset passwords, and export data.',
      access: {
        read: { status: true, details: 'Able to view the complete user list' },
        update: {
          status: true,
          details:
            'Can edit user details, reset password, add remarks, and block/unblock users',
        },
        detailedView: {
          status: true,
          details:
            'Can access full user profiles, including bet history and transactions',
        },
        download: {
          status: true,
          details: 'Able to export user data from the listing table',
        },
      },
    },
    {
      permissions: 'Agents',
      description:
        'Displays and manages all agents and their users. Can add, edit, block/unblock, and export agent data.',
      access: {
        create: { status: true, details: 'Can add a new agent' },
        read: { status: true, details: 'Able to view agent list' },
        update: {
          status: true,
          details:
            'Can edit agent details, reset passwords, add remarks, and block/unblock agents/users',
        },
        detailedView: {
          status: true,
          details:
            'Can access full details of agents, their user listings, bet history, and transactions',
        },
        download: {
          status: true,
          details: 'Able to export data in report format',
        },
      },
    },
    {
      permissions: 'Sales',
      description:
        'Displays all sales (user, agent, offline). Allows viewing, verifying, copying, and exporting sales data.',
      access: {
        read: { status: true, details: 'View access to all sales records' },
        update: { status: true, details: 'Can copy sales data' },
        detailedView: {
          status: true,
          details: 'Can view ticket numbers and purchase details',
        },
        download: { status: true, details: 'Can export sales data' },
      },
    },
    {
      permissions: 'Lottery',
      description:
        'Lists all draws (manual and auto). Can create, edit, view details, and export results.',
      access: {
        read: { status: true, details: 'View list of all draws' },
        update: { status: true, details: 'Can create or edit draws' },
        detailedView: {
          status: true,
          details: 'Access to view all draw details and results',
        },
        download: { status: true, details: 'Can export lottery data' },
      },
    },
    {
      permissions: 'Transaction',
      description:
        'Shows all transaction types including PG Deposits, Settlements, and user activity transactions.',
      access: {
        read: { status: true, details: 'Can view all user transactions' },
        update: { status: true, details: 'Can edit or verify transactions' },
        detailedView: {
          status: true,
          details: 'Can view full transaction details and histories',
        },
        download: { status: true, details: 'Can export transaction data' },
      },
    },
    {
      permissions: 'Withdraw Request',
      description:
        'Lists all withdrawal requests by users and agents. Allows viewing, approving, and rejecting withdrawals.',
      access: {
        read: { status: true, details: 'Can view withdrawal requests' },
        update: { status: true, details: 'Can approve or reject requests' },
        detailedView: {
          status: true,
          details: 'Can view detailed info for each withdrawal',
        },
        download: { status: true, details: 'Can export withdrawal data' },
      },
    },
    {
      permissions: 'KYC',
      description:
        'Manages all KYC verification requests. Allows viewing, approving, and rejecting documents.',
      access: {
        read: { status: true, details: 'Can view KYC requests' },
        update: { status: true, details: 'Can approve/reject KYC' },
        detailedView: {
          status: true,
          details: 'Can view submitted documents and user details',
        },
      },
    },
    {
      permissions: 'Claim Request',
      description:
        'Handles all prize claim requests. Can approve, reject, and view detailed claim info.',
      access: {
        read: { status: true, details: 'Can view claim requests' },
        update: { status: true, details: 'Can approve/reject claims' },
        detailedView: {
          status: true,
          details: 'Can view complete claim information',
        },
        download: { status: true, details: 'Can export claim data' },
      },
    },
    {
      permissions: 'Change Password',
      description:
        'Allows authorized users to reset passwords for users or agents to maintain security.',
      access: {
        update: {
          status: true,
          details: 'Allows password reset of users or agents',
        },
      },
    },
    {
      permissions: 'Roles Privileges',
      description:
        'Manage system roles and access permissions. Allows role creation, update, and access assignment.',
      access: {
        read: {
          status: true,
          details: 'Can view list of roles and access settings',
        },
        update: {
          status: true,
          details: 'Can create/edit roles and modify permissions',
        },
        detailedView: {
          status: true,
          details: 'Can view detailed role privileges',
        },
        delete: {
          status: true,
          details: 'Can delete any role or access control entry',
        },
      },
    },
  ];

  for (const priv of privileges) {
    await prisma.privilege.upsert({
      where: { permissions: priv.permissions },
      update: {
        description: priv.description,
        access: priv.access,
      },
      create: priv,
    });
  }

  // Step 2️⃣ — Seed Roles from Config
  const roleEntries = Object.entries(rolesConfig);
  for (const [name, roleData] of roleEntries) {
    await prisma.role.upsert({
      where: { name },
      update: {
        description: roleData.description,
        isEditable: false,
        level: roleData.level,
      },
      create: {
        name,
        description: roleData.description,
        level: roleData.level,
        isEditable: false,
        updatedBy: id,
      },
    });
  }

  // Step 3️⃣ — Assign privileges
  const allPrivileges = await prisma.privilege.findMany();
  const roles = await prisma.role.findMany();

  // Assign full access to OWNER
  const ownerRole = roles.find((r) => r.name === 'ADMIN');
  if (ownerRole) {
    for (const priv of allPrivileges) {
      await prisma.rolePrivilege.upsert({
        where: {
          roleId_privilegeId: {
            roleId: ownerRole.id,
            privilegeId: priv.id,
          },
        },
        update: {},
        create: {
          roleId: ownerRole.id,
          privilegeId: priv.id,
          updatedBy: id,
          updatedAccess: {
            create: true,
            read: true,
            update: true,
            detailedView: true,
            download: true,
            delete: true,
          },
        },
      });
    }
  }

  // Assign limited modules to USER
  const userRole = roles.find((r) => r.name === 'USER');
  if (userRole) {
    const allowedModules = ['Dashboard', 'Sales', 'Lottery', 'Transaction'];
    for (const priv of allPrivileges) {
      if (allowedModules.includes(priv.permissions)) {
        await prisma.rolePrivilege.upsert({
          where: {
            roleId_privilegeId: {
              roleId: userRole.id,
              privilegeId: priv.id,
            },
          },
          update: {},
          create: {
            roleId: userRole.id,
            privilegeId: priv.id,
            updatedBy: id,
            updatedAccess: {
              create: false,
              read: true,
              update: false,
              detailedView: true,
              download: false,
            },
          },
        });
      }
    }
  }

  console.log('✅ Seeded privileges, roles, and access successfully!');
}
