import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

async function wakeDatabase(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch {
      if (i < retries - 1) {
        console.log('Waking database... (attempt ' + (i + 1) + ')');
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
}

async function main() {
  console.log('Seeding database...');

  await wakeDatabase();

  // Clean existing data
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.member.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();

  // Create users
  const ownerPassword = await bcrypt.hash('owner123', 10);
  const managerPassword = await bcrypt.hash('manager123', 10);

  const owner = await prisma.user.create({
    data: {
      email: 'owner@fcms.com',
      name: 'Owner',
      role: 'owner',
      phone: '+251911000000',
      isActive: true,
    },
  });

  await prisma.account.create({
    data: {
      userId: owner.id,
      accountId: owner.id,
      providerId: 'credential',
      password: ownerPassword,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: 'manager@fcms.com',
      name: 'Manager',
      role: 'manager',
      phone: '+251922000000',
      isActive: true,
    },
  });

  await prisma.account.create({
    data: {
      userId: manager.id,
      accountId: manager.id,
      providerId: 'credential',
      password: managerPassword,
    },
  });

  console.log('Created users:', owner.email, manager.email);

  // Create 3 services: Gym, Karate, Aerobics
  const services = await Promise.all([
    prisma.service.create({
      data: {
        name: 'Gym',
        nameAm: 'ጂም',
        description: 'Full gym access with all equipment and facilities',
        descriptionAm: 'ሙሉ የጂም ተደራሽነት ከሁሉም መሳሪያዎች እና ተቋማት ጋር',
        price: 1500,
        duration: 30,
        isActive: true,
      },
    }),
    prisma.service.create({
      data: {
        name: 'Karate',
        nameAm: 'ካራቴ',
        description: 'Karate training classes with professional instructors',
        descriptionAm: 'በሙያተኞች አሰልጣኞች የሚሰጥ የካራቴ ስልጠና',
        price: 2000,
        duration: 30,
        isActive: true,
      },
    }),
    prisma.service.create({
      data: {
        name: 'Aerobics',
        nameAm: 'ኤሮቢክስ',
        description: 'Aerobics and fitness classes for all levels',
        descriptionAm: 'ለሁሉም ደረጃ የኤሮቢክስ እና የአካል ብቃት ክፍሎች',
        price: 1200,
        duration: 30,
        isActive: true,
      },
    }),
  ]);

  console.log(`Created ${services.length} services: Gym, Karate, Aerobics`);

  // Create members with realistic Ethiopian names
  const memberData = [
    { firstName: 'Abebe', lastName: 'Kebede', phone: '+251911001001', address: 'Bole, Addis Ababa', weight: 75, height: 175, bloodType: 'O+', emergencyContact: '+251911001002 (Wife)' },
    { firstName: 'Tigist', lastName: 'Haile', phone: '+251922002002', address: 'Kazanchis, Addis Ababa', weight: 58, height: 163, bloodType: 'A+', emergencyContact: '+251922002003 (Husband)' },
    { firstName: 'Dawit', lastName: 'Amare', phone: '+251933003003', address: 'CMC, Addis Ababa', weight: 80, height: 180, bloodType: 'B+', emergencyContact: '+251933003004 (Brother)' },
    { firstName: 'Mekdes', lastName: 'Tadesse', phone: '+251944004004', address: 'Sarbet, Addis Ababa', weight: 55, height: 158, bloodType: 'AB+' },
    { firstName: 'Yonas', lastName: 'Gebre', phone: '+251955005005', address: 'Megenagna, Addis Ababa', weight: 70, height: 172, bloodType: 'O-', emergencyContact: '+251955005006 (Father)' },
    { firstName: 'Hiwot', lastName: 'Alemu', phone: '+251966006006', address: 'Piassa, Addis Ababa', weight: 62, height: 165, bloodType: 'A-' },
    { firstName: 'Solomon', lastName: 'Bekele', phone: '+251977007007', address: 'Lideta, Addis Ababa', weight: 85, height: 178, bloodType: 'B-', emergencyContact: '+251977007008 (Wife)' },
    { firstName: 'Frehiwot', lastName: 'Dinku', phone: '+251988008008', address: 'Kirkos, Addis Ababa', weight: 60, height: 160, bloodType: 'AB-' },
    { firstName: 'Bereket', lastName: 'Fikadu', phone: '+251999009009', address: 'Gulele, Addis Ababa', weight: 72, height: 170, bloodType: 'O+', emergencyContact: '+251999009010 (Mother)' },
    { firstName: 'Selamawit', lastName: 'Girma', phone: '+251910010010', address: 'Nifas Silk, Addis Ababa', weight: 57, height: 162, bloodType: 'A+', emergencyContact: '+251910010011 (Sister)' },
  ];

  const members = await Promise.all(
    memberData.map((m) =>
      prisma.member.create({
        data: m,
      })
    )
  );

  console.log(`Created ${members.length} members`);

  // Create sample subscriptions and payments
  // Flow: subscription + payment created in one transaction
  const now = new Date();
  const receiptCounter = { value: 1000 };

  function generateReceiptNumber(): string {
    receiptCounter.value++;
    return `RCP-${receiptCounter.value.toString().padStart(6, '0')}`;
  }

  // Member 0: Abebe - Gym, active (paid cash)
  await prisma.subscription.create({
    data: {
      memberId: members[0].id,
      serviceId: services[0].id,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[0].price,
      payments: {
        create: {
          memberId: members[0].id,
          amount: services[0].price,
          paymentDate: new Date(now.getFullYear(), now.getMonth(), 3),
          method: 'cash',
          receiptNumber: generateReceiptNumber(),
          createdBy: owner.id,
        },
      },
    },
  });

  // Member 1: Tigist - Karate, active (paid via bank transfer)
  await prisma.subscription.create({
    data: {
      memberId: members[1].id,
      serviceId: services[1].id,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[1].price,
      payments: {
        create: {
          memberId: members[1].id,
          amount: services[1].price,
          paymentDate: new Date(now.getFullYear(), now.getMonth(), 2),
          method: 'bank_transfer',
          receiptNumber: generateReceiptNumber(),
          createdBy: manager.id,
        },
      },
    },
  });

  // Member 2: Dawit - Gym, active (paid cash)
  await prisma.subscription.create({
    data: {
      memberId: members[2].id,
      serviceId: services[0].id,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[0].price,
      payments: {
        create: {
          memberId: members[2].id,
          amount: services[0].price,
          paymentDate: new Date(now.getFullYear(), now.getMonth(), 8),
          method: 'cash',
          receiptNumber: generateReceiptNumber(),
          createdBy: owner.id,
        },
      },
    },
  });

  // Member 3: Mekdes - Aerobics, expired (was paid)
  await prisma.subscription.create({
    data: {
      memberId: members[3].id,
      serviceId: services[2].id,
      startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
      endDate: new Date(now.getFullYear(), now.getMonth() - 1, 0),
      status: 'expired',
      priceSnapshot: services[2].price,
      payments: {
        create: {
          memberId: members[3].id,
          amount: services[2].price,
          paymentDate: new Date(now.getFullYear(), now.getMonth() - 2, 4),
          method: 'cash',
          receiptNumber: generateReceiptNumber(),
          createdBy: manager.id,
        },
      },
    },
  });

  // Member 4: Yonas - Karate, active (paid via mobile money)
  await prisma.subscription.create({
    data: {
      memberId: members[4].id,
      serviceId: services[1].id,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[1].price,
      payments: {
        create: {
          memberId: members[4].id,
          amount: services[1].price,
          paymentDate: new Date(now.getFullYear(), now.getMonth(), 5),
          method: 'mobile_money',
          receiptNumber: generateReceiptNumber(),
          createdBy: owner.id,
        },
      },
    },
  });

  // Member 5: Hiwot - Aerobics, active (no payment yet - pending)
  await prisma.subscription.create({
    data: {
      memberId: members[5].id,
      serviceId: services[2].id,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[2].price,
    },
  });

  // Member 6: Solomon - Gym, active (paid via bank transfer)
  await prisma.subscription.create({
    data: {
      memberId: members[6].id,
      serviceId: services[0].id,
      startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      endDate: new Date(now.getFullYear(), now.getMonth(), 0),
      status: 'active',
      priceSnapshot: services[0].price,
      payments: {
        create: {
          memberId: members[6].id,
          amount: services[0].price,
          paymentDate: new Date(now.getFullYear(), now.getMonth() - 1, 7),
          method: 'bank_transfer',
          receiptNumber: generateReceiptNumber(),
          createdBy: manager.id,
        },
      },
    },
  });

  // Member 7: Frehiwot - Karate, active (no payment yet - pending)
  await prisma.subscription.create({
    data: {
      memberId: members[7].id,
      serviceId: services[1].id,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[1].price,
    },
  });

  // Member 8: Bereket - Gym, cancelled
  await prisma.subscription.create({
    data: {
      memberId: members[8].id,
      serviceId: services[0].id,
      startDate: new Date(now.getFullYear(), now.getMonth() - 3, 1),
      endDate: new Date(now.getFullYear(), now.getMonth() - 2, 0),
      status: 'cancelled',
      priceSnapshot: services[0].price,
      notes: 'Cancelled at member request',
    },
  });

  // Member 9: Selamawit - Gym + Aerobics, both active (paid cash for both)
  await prisma.subscription.create({
    data: {
      memberId: members[9].id,
      serviceId: services[0].id,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[0].price,
      payments: {
        create: {
          memberId: members[9].id,
          amount: services[0].price,
          paymentDate: new Date(now.getFullYear(), now.getMonth(), 2),
          method: 'cash',
          receiptNumber: generateReceiptNumber(),
          createdBy: owner.id,
        },
      },
    },
  });

  await prisma.subscription.create({
    data: {
      memberId: members[9].id,
      serviceId: services[2].id,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[2].price,
      payments: {
        create: {
          memberId: members[9].id,
          amount: services[2].price,
          paymentDate: new Date(now.getFullYear(), now.getMonth(), 2),
          method: 'cash',
          receiptNumber: generateReceiptNumber(),
          createdBy: manager.id,
        },
      },
    },
  });

  console.log('Created sample subscriptions and payments');

  // Create some audit logs
  await prisma.auditLog.createMany({
    data: [
      {
        userId: owner.id,
        action: 'user.create',
        entity: 'user',
        entityId: manager.id,
        details: JSON.stringify({ email: manager.email, role: manager.role }),
      },
      {
        userId: owner.id,
        action: 'service.create',
        entity: 'service',
        details: JSON.stringify({ services: ['Gym', 'Karate', 'Aerobics'] }),
      },
      {
        userId: manager.id,
        action: 'member.create',
        entity: 'member',
        details: JSON.stringify({ count: members.length }),
      },
      {
        userId: owner.id,
        action: 'subscription.create',
        entity: 'subscription',
        details: JSON.stringify({ info: 'Initial seed data' }),
      },
      {
        userId: manager.id,
        action: 'payment.create',
        entity: 'payment',
        details: JSON.stringify({ info: 'Initial seed data - payments recorded' }),
      },
    ],
  });

  console.log('Created audit logs');
  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
