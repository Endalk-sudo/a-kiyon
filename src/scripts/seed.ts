import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clean existing data
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
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
    { firstName: 'Abebe', lastName: 'Kebede', phone: '+251911001001', email: 'abebe.k@example.com', address: 'Bole, Addis Ababa', weight: 75, height: 175, bloodType: 'O+', emergencyContact: '+251911001002 (Wife)' },
    { firstName: 'Tigist', lastName: 'Haile', phone: '+251922002002', email: 'tigist.h@example.com', address: 'Kazanchis, Addis Ababa', weight: 58, height: 163, bloodType: 'A+', emergencyContact: '+251922002003 (Husband)' },
    { firstName: 'Dawit', lastName: 'Amare', phone: '+251933003003', email: 'dawit.a@example.com', address: 'CMC, Addis Ababa', weight: 80, height: 180, bloodType: 'B+', emergencyContact: '+251933003004 (Brother)' },
    { firstName: 'Mekdes', lastName: 'Tadesse', phone: '+251944004004', email: 'mekdes.t@example.com', address: 'Sarbet, Addis Ababa', weight: 55, height: 158, bloodType: 'AB+' },
    { firstName: 'Yonas', lastName: 'Gebre', phone: '+251955005005', email: 'yonas.g@example.com', address: 'Megenagna, Addis Ababa', weight: 70, height: 172, bloodType: 'O-', emergencyContact: '+251955005006 (Father)' },
    { firstName: 'Hiwot', lastName: 'Alemu', phone: '+251966006006', email: 'hiwot.a@example.com', address: 'Piassa, Addis Ababa', weight: 62, height: 165, bloodType: 'A-' },
    { firstName: 'Solomon', lastName: 'Bekele', phone: '+251977007007', email: 'solomon.b@example.com', address: 'Lideta, Addis Ababa', weight: 85, height: 178, bloodType: 'B-', emergencyContact: '+251977007008 (Wife)' },
    { firstName: 'Frehiwot', lastName: 'Dinku', phone: '+251988008008', email: 'frehiwot.d@example.com', address: 'Kirkos, Addis Ababa', weight: 60, height: 160, bloodType: 'AB-' },
    { firstName: 'Bereket', lastName: 'Fikadu', phone: '+251999009009', email: 'bereket.f@example.com', address: 'Gulele, Addis Ababa', weight: 72, height: 170, bloodType: 'O+', emergencyContact: '+251999009010 (Mother)' },
    { firstName: 'Selamawit', lastName: 'Girma', phone: '+251910010010', email: 'selamawit.g@example.com', address: 'Nifas Silk, Addis Ababa', weight: 57, height: 162, bloodType: 'A+', emergencyContact: '+251910010011 (Sister)' },
  ];

  const members = await Promise.all(
    memberData.map((m) =>
      prisma.member.create({
        data: m,
      })
    )
  );

  console.log(`Created ${members.length} members`);

  // Create sample subscriptions, invoices, and payments
  // Manual payment flow: 
  // 1. Member comes and pays cash to owner/manager
  // 2. Owner/manager creates subscription in the system
  // 3. A pending invoice is auto-created
  // 4. Owner/manager records the payment to mark invoice as paid
  const now = new Date();
  const receiptCounter = { value: 1000 };

  function generateReceiptNumber(): string {
    receiptCounter.value++;
    return `RCP-${receiptCounter.value.toString().padStart(6, '0')}`;
  }

  // Member 0: Abebe - Gym, active (paid)
  const sub0 = await prisma.subscription.create({
    data: {
      memberId: members[0].id,
      serviceId: services[0].id, // Gym
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[0].price,
    },
  });
  const inv0 = await prisma.invoice.create({
    data: {
      memberId: members[0].id,
      subscriptionId: sub0.id,
      amount: services[0].price,
      status: 'paid',
      dueDate: new Date(now.getFullYear(), now.getMonth(), 5),
      paidAt: new Date(now.getFullYear(), now.getMonth(), 3),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv0.id,
      memberId: members[0].id,
      amount: services[0].price,
      paymentDate: new Date(now.getFullYear(), now.getMonth(), 3),
      method: 'cash',
      receiptNumber: generateReceiptNumber(),
      createdBy: owner.id,
    },
  });

  // Member 1: Tigist - Karate, active (paid via bank transfer)
  const sub1 = await prisma.subscription.create({
    data: {
      memberId: members[1].id,
      serviceId: services[1].id, // Karate
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[1].price,
    },
  });
  const inv1 = await prisma.invoice.create({
    data: {
      memberId: members[1].id,
      subscriptionId: sub1.id,
      amount: services[1].price,
      status: 'paid',
      dueDate: new Date(now.getFullYear(), now.getMonth(), 5),
      paidAt: new Date(now.getFullYear(), now.getMonth(), 2),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv1.id,
      memberId: members[1].id,
      amount: services[1].price,
      paymentDate: new Date(now.getFullYear(), now.getMonth(), 2),
      method: 'bank_transfer',
      receiptNumber: generateReceiptNumber(),
      createdBy: manager.id,
    },
  });

  // Member 2: Dawit - Gym, active (paid)
  const sub2 = await prisma.subscription.create({
    data: {
      memberId: members[2].id,
      serviceId: services[0].id, // Gym
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[0].price,
    },
  });
  const inv2 = await prisma.invoice.create({
    data: {
      memberId: members[2].id,
      subscriptionId: sub2.id,
      amount: services[0].price,
      status: 'paid',
      dueDate: new Date(now.getFullYear(), now.getMonth(), 10),
      paidAt: new Date(now.getFullYear(), now.getMonth(), 8),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv2.id,
      memberId: members[2].id,
      amount: services[0].price,
      paymentDate: new Date(now.getFullYear(), now.getMonth(), 8),
      method: 'cash',
      receiptNumber: generateReceiptNumber(),
      createdBy: owner.id,
    },
  });

  // Member 3: Mekdes - Aerobics, expired (was paid)
  const sub3 = await prisma.subscription.create({
    data: {
      memberId: members[3].id,
      serviceId: services[2].id, // Aerobics
      startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
      endDate: new Date(now.getFullYear(), now.getMonth() - 1, 0),
      status: 'expired',
      priceSnapshot: services[2].price,
    },
  });
  const inv3 = await prisma.invoice.create({
    data: {
      memberId: members[3].id,
      subscriptionId: sub3.id,
      amount: services[2].price,
      status: 'paid',
      dueDate: new Date(now.getFullYear(), now.getMonth() - 2, 5),
      paidAt: new Date(now.getFullYear(), now.getMonth() - 2, 4),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv3.id,
      memberId: members[3].id,
      amount: services[2].price,
      paymentDate: new Date(now.getFullYear(), now.getMonth() - 2, 4),
      method: 'cash',
      receiptNumber: generateReceiptNumber(),
      createdBy: manager.id,
    },
  });

  // Member 4: Yonas - Karate, active (paid via mobile money)
  const sub4 = await prisma.subscription.create({
    data: {
      memberId: members[4].id,
      serviceId: services[1].id, // Karate
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[1].price,
    },
  });
  const inv4 = await prisma.invoice.create({
    data: {
      memberId: members[4].id,
      subscriptionId: sub4.id,
      amount: services[1].price,
      status: 'paid',
      dueDate: new Date(now.getFullYear(), now.getMonth(), 10),
      paidAt: new Date(now.getFullYear(), now.getMonth(), 5),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv4.id,
      memberId: members[4].id,
      amount: services[1].price,
      paymentDate: new Date(now.getFullYear(), now.getMonth(), 5),
      method: 'mobile_money',
      receiptNumber: generateReceiptNumber(),
      createdBy: owner.id,
    },
  });

  // Member 5: Hiwot - Aerobics, active with pending invoice (not yet paid)
  const sub5 = await prisma.subscription.create({
    data: {
      memberId: members[5].id,
      serviceId: services[2].id, // Aerobics
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[2].price,
    },
  });
  await prisma.invoice.create({
    data: {
      memberId: members[5].id,
      subscriptionId: sub5.id,
      amount: services[2].price,
      status: 'pending',
      dueDate: new Date(now.getFullYear(), now.getMonth(), 15),
    },
  });

  // Member 6: Solomon - Gym, active (paid)
  const sub6 = await prisma.subscription.create({
    data: {
      memberId: members[6].id,
      serviceId: services[0].id, // Gym
      startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      endDate: new Date(now.getFullYear(), now.getMonth(), 0),
      status: 'active',
      priceSnapshot: services[0].price,
    },
  });
  const inv6 = await prisma.invoice.create({
    data: {
      memberId: members[6].id,
      subscriptionId: sub6.id,
      amount: services[0].price,
      status: 'paid',
      dueDate: new Date(now.getFullYear(), now.getMonth() - 1, 10),
      paidAt: new Date(now.getFullYear(), now.getMonth() - 1, 7),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv6.id,
      memberId: members[6].id,
      amount: services[0].price,
      paymentDate: new Date(now.getFullYear(), now.getMonth() - 1, 7),
      method: 'bank_transfer',
      receiptNumber: generateReceiptNumber(),
      createdBy: manager.id,
    },
  });

  // Member 7: Frehiwot - Karate, active with overdue invoice
  const sub7 = await prisma.subscription.create({
    data: {
      memberId: members[7].id,
      serviceId: services[1].id, // Karate
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[1].price,
    },
  });
  await prisma.invoice.create({
    data: {
      memberId: members[7].id,
      subscriptionId: sub7.id,
      amount: services[1].price,
      status: 'overdue',
      dueDate: new Date(now.getFullYear(), now.getMonth(), 5),
    },
  });

  // Member 8: Bereket - Gym, expired (cancelled subscription)
  const sub8 = await prisma.subscription.create({
    data: {
      memberId: members[8].id,
      serviceId: services[0].id, // Gym
      startDate: new Date(now.getFullYear(), now.getMonth() - 3, 1),
      endDate: new Date(now.getFullYear(), now.getMonth() - 2, 0),
      status: 'cancelled',
      priceSnapshot: services[0].price,
      notes: 'Cancelled at member request',
    },
  });
  await prisma.invoice.create({
    data: {
      memberId: members[8].id,
      subscriptionId: sub8.id,
      amount: services[0].price,
      status: 'cancelled',
      dueDate: new Date(now.getFullYear(), now.getMonth() - 3, 10),
    },
  });

  // Member 9: Selamawit - Gym + Aerobics, both active (paid for both)
  const sub9a = await prisma.subscription.create({
    data: {
      memberId: members[9].id,
      serviceId: services[0].id, // Gym
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[0].price,
    },
  });
  const inv9a = await prisma.invoice.create({
    data: {
      memberId: members[9].id,
      subscriptionId: sub9a.id,
      amount: services[0].price,
      status: 'paid',
      dueDate: new Date(now.getFullYear(), now.getMonth(), 5),
      paidAt: new Date(now.getFullYear(), now.getMonth(), 2),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv9a.id,
      memberId: members[9].id,
      amount: services[0].price,
      paymentDate: new Date(now.getFullYear(), now.getMonth(), 2),
      method: 'cash',
      receiptNumber: generateReceiptNumber(),
      createdBy: owner.id,
    },
  });

  const sub9b = await prisma.subscription.create({
    data: {
      memberId: members[9].id,
      serviceId: services[2].id, // Aerobics
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[2].price,
    },
  });
  const inv9b = await prisma.invoice.create({
    data: {
      memberId: members[9].id,
      subscriptionId: sub9b.id,
      amount: services[2].price,
      status: 'paid',
      dueDate: new Date(now.getFullYear(), now.getMonth(), 5),
      paidAt: new Date(now.getFullYear(), now.getMonth(), 2),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv9b.id,
      memberId: members[9].id,
      amount: services[2].price,
      paymentDate: new Date(now.getFullYear(), now.getMonth(), 2),
      method: 'cash',
      receiptNumber: generateReceiptNumber(),
      createdBy: manager.id,
    },
  });

  console.log('Created sample subscriptions, invoices, and payments');

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
        details: JSON.stringify({ info: 'Initial seed data - manual payments recorded' }),
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
