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
      password: ownerPassword,
      role: 'owner',
      phone: '+251911000000',
      isActive: true,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: 'manager@fcms.com',
      name: 'Manager',
      password: managerPassword,
      role: 'manager',
      phone: '+251922000000',
      isActive: true,
    },
  });

  console.log('Created users:', owner.email, manager.email);

  // Create services
  const services = await Promise.all([
    prisma.service.create({
      data: {
        name: 'Monthly Gym',
        nameAm: 'ወርሃዊ ጂም',
        description: 'Standard monthly gym access',
        descriptionAm: 'መደበኛ ወርሃዊ የጂም ተደራሽነት',
        price: 1500,
        duration: 30,
        isActive: true,
      },
    }),
    prisma.service.create({
      data: {
        name: '3-Month Gym',
        nameAm: '3 ወር ጂም',
        description: '3-month gym access package',
        descriptionAm: '3 ወር የጂም ተደራሽነት ፓኬጅ',
        price: 4000,
        duration: 90,
        isActive: true,
      },
    }),
    prisma.service.create({
      data: {
        name: '6-Month Gym',
        nameAm: '6 ወር ጂም',
        description: '6-month gym access package',
        descriptionAm: '6 ወር የጂም ተደራሽነት ፓኬጅ',
        price: 7500,
        duration: 180,
        isActive: true,
      },
    }),
    prisma.service.create({
      data: {
        name: 'Annual Gym',
        nameAm: 'ዓመታዊ ጂም',
        description: 'Annual gym access package',
        descriptionAm: 'ዓመታዊ የጂም ተደራሽነት ፓኬጅ',
        price: 14000,
        duration: 365,
        isActive: true,
      },
    }),
    prisma.service.create({
      data: {
        name: 'Personal Training',
        nameAm: 'የግል ስልጠና',
        description: 'One-on-one personal training sessions',
        descriptionAm: 'አንድ ላይ የግል ስልጠና ክፍለ ጊዜዎች',
        price: 3000,
        duration: 30,
        isActive: true,
      },
    }),
    prisma.service.create({
      data: {
        name: 'Yoga Class',
        nameAm: 'የዮጋ ክፍል',
        description: 'Group yoga classes',
        descriptionAm: 'የቡድን ዮጋ ክፍሎች',
        price: 2000,
        duration: 30,
        isActive: true,
      },
    }),
  ]);

  console.log(`Created ${services.length} services`);

  // Create members with realistic Ethiopian names
  const memberData = [
    { firstName: 'Abebe', lastName: 'Kebede', phone: '+251911001001', email: 'abebe.k@example.com' },
    { firstName: 'Tigist', lastName: 'Haile', phone: '+251922002002', email: 'tigist.h@example.com' },
    { firstName: 'Dawit', lastName: 'Amare', phone: '+251933003003', email: 'dawit.a@example.com' },
    { firstName: 'Mekdes', lastName: 'Tadesse', phone: '+251944004004', email: 'mekdes.t@example.com' },
    { firstName: 'Yonas', lastName: 'Gebre', phone: '+251955005005', email: 'yonas.g@example.com' },
    { firstName: 'Hiwot', lastName: 'Alemu', phone: '+251966006006', email: 'hiwot.a@example.com' },
    { firstName: 'Solomon', lastName: 'Bekele', phone: '+251977007007', email: 'solomon.b@example.com' },
    { firstName: 'Frehiwot', lastName: 'Dinku', phone: '+251988008008', email: 'frehiwot.d@example.com' },
    { firstName: 'Bereket', lastName: 'Fikadu', phone: '+251999009009', email: 'bereket.f@example.com' },
    { firstName: 'Selamawit', lastName: 'Girma', phone: '+251910010010', email: 'selamawit.g@example.com' },
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
  const now = new Date();
  const receiptCounter = { value: 1000 };

  function generateReceiptNumber(): string {
    receiptCounter.value++;
    return `RCP-${receiptCounter.value.toString().padStart(6, '0')}`;
  }

  // Member 0: Abebe - Monthly Gym, active
  const sub0 = await prisma.subscription.create({
    data: {
      memberId: members[0].id,
      serviceId: services[0].id,
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

  // Member 1: Tigist - 3-Month Gym, active
  const sub1 = await prisma.subscription.create({
    data: {
      memberId: members[1].id,
      serviceId: services[1].id,
      startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 2, 0),
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
      dueDate: new Date(now.getFullYear(), now.getMonth() - 1, 5),
      paidAt: new Date(now.getFullYear(), now.getMonth() - 1, 2),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv1.id,
      memberId: members[1].id,
      amount: services[1].price,
      paymentDate: new Date(now.getFullYear(), now.getMonth() - 1, 2),
      method: 'bank_transfer',
      receiptNumber: generateReceiptNumber(),
      createdBy: manager.id,
    },
  });

  // Member 2: Dawit - Annual Gym, active
  const sub2 = await prisma.subscription.create({
    data: {
      memberId: members[2].id,
      serviceId: services[3].id,
      startDate: new Date(now.getFullYear(), 0, 1),
      endDate: new Date(now.getFullYear(), 11, 31),
      status: 'active',
      priceSnapshot: services[3].price,
    },
  });
  const inv2 = await prisma.invoice.create({
    data: {
      memberId: members[2].id,
      subscriptionId: sub2.id,
      amount: services[3].price,
      status: 'paid',
      dueDate: new Date(now.getFullYear(), 0, 10),
      paidAt: new Date(now.getFullYear(), 0, 8),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv2.id,
      memberId: members[2].id,
      amount: services[3].price,
      paymentDate: new Date(now.getFullYear(), 0, 8),
      method: 'mobile_money',
      receiptNumber: generateReceiptNumber(),
      createdBy: owner.id,
    },
  });

  // Member 3: Mekdes - Monthly Gym, expired
  const sub3 = await prisma.subscription.create({
    data: {
      memberId: members[3].id,
      serviceId: services[0].id,
      startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
      endDate: new Date(now.getFullYear(), now.getMonth() - 1, 0),
      status: 'expired',
      priceSnapshot: services[0].price,
    },
  });
  const inv3 = await prisma.invoice.create({
    data: {
      memberId: members[3].id,
      subscriptionId: sub3.id,
      amount: services[0].price,
      status: 'paid',
      dueDate: new Date(now.getFullYear(), now.getMonth() - 2, 5),
      paidAt: new Date(now.getFullYear(), now.getMonth() - 2, 4),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv3.id,
      memberId: members[3].id,
      amount: services[0].price,
      paymentDate: new Date(now.getFullYear(), now.getMonth() - 2, 4),
      method: 'cash',
      receiptNumber: generateReceiptNumber(),
      createdBy: manager.id,
    },
  });

  // Member 4: Yonas - Yoga Class, active
  const sub4 = await prisma.subscription.create({
    data: {
      memberId: members[4].id,
      serviceId: services[5].id,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[5].price,
    },
  });
  const inv4 = await prisma.invoice.create({
    data: {
      memberId: members[4].id,
      subscriptionId: sub4.id,
      amount: services[5].price,
      status: 'paid',
      dueDate: new Date(now.getFullYear(), now.getMonth(), 10),
      paidAt: new Date(now.getFullYear(), now.getMonth(), 5),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv4.id,
      memberId: members[4].id,
      amount: services[5].price,
      paymentDate: new Date(now.getFullYear(), now.getMonth(), 5),
      method: 'cash',
      receiptNumber: generateReceiptNumber(),
      createdBy: owner.id,
    },
  });

  // Member 5: Hiwot - Personal Training, active with pending invoice
  const sub5 = await prisma.subscription.create({
    data: {
      memberId: members[5].id,
      serviceId: services[4].id,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[4].price,
    },
  });
  await prisma.invoice.create({
    data: {
      memberId: members[5].id,
      subscriptionId: sub5.id,
      amount: services[4].price,
      status: 'pending',
      dueDate: new Date(now.getFullYear(), now.getMonth(), 15),
    },
  });

  // Member 6: Solomon - 6-Month Gym, active
  const sub6 = await prisma.subscription.create({
    data: {
      memberId: members[6].id,
      serviceId: services[2].id,
      startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 4, 0),
      status: 'active',
      priceSnapshot: services[2].price,
    },
  });
  const inv6 = await prisma.invoice.create({
    data: {
      memberId: members[6].id,
      subscriptionId: sub6.id,
      amount: services[2].price,
      status: 'paid',
      dueDate: new Date(now.getFullYear(), now.getMonth() - 2, 10),
      paidAt: new Date(now.getFullYear(), now.getMonth() - 2, 7),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv6.id,
      memberId: members[6].id,
      amount: services[2].price,
      paymentDate: new Date(now.getFullYear(), now.getMonth() - 2, 7),
      method: 'bank_transfer',
      receiptNumber: generateReceiptNumber(),
      createdBy: manager.id,
    },
  });

  // Member 7: Frehiwot - Monthly Gym, overdue invoice
  const sub7 = await prisma.subscription.create({
    data: {
      memberId: members[7].id,
      serviceId: services[0].id,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[0].price,
    },
  });
  await prisma.invoice.create({
    data: {
      memberId: members[7].id,
      subscriptionId: sub7.id,
      amount: services[0].price,
      status: 'overdue',
      dueDate: new Date(now.getFullYear(), now.getMonth(), 5),
    },
  });

  // Member 8: Bereket - 3-Month Gym, cancelled
  const sub8 = await prisma.subscription.create({
    data: {
      memberId: members[8].id,
      serviceId: services[1].id,
      startDate: new Date(now.getFullYear(), now.getMonth() - 3, 1),
      endDate: new Date(now.getFullYear(), now.getMonth(), 0),
      status: 'cancelled',
      priceSnapshot: services[1].price,
      notes: 'Cancelled at member request',
    },
  });
  await prisma.invoice.create({
    data: {
      memberId: members[8].id,
      subscriptionId: sub8.id,
      amount: services[1].price,
      status: 'cancelled',
      dueDate: new Date(now.getFullYear(), now.getMonth() - 3, 10),
    },
  });

  // Member 9: Selamawit - Monthly Gym + Yoga Class, both active
  const sub9a = await prisma.subscription.create({
    data: {
      memberId: members[9].id,
      serviceId: services[0].id,
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
      method: 'mobile_money',
      receiptNumber: generateReceiptNumber(),
      createdBy: owner.id,
    },
  });

  const sub9b = await prisma.subscription.create({
    data: {
      memberId: members[9].id,
      serviceId: services[5].id,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: 'active',
      priceSnapshot: services[5].price,
    },
  });
  const inv9b = await prisma.invoice.create({
    data: {
      memberId: members[9].id,
      subscriptionId: sub9b.id,
      amount: services[5].price,
      status: 'paid',
      dueDate: new Date(now.getFullYear(), now.getMonth(), 5),
      paidAt: new Date(now.getFullYear(), now.getMonth(), 2),
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv9b.id,
      memberId: members[9].id,
      amount: services[5].price,
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
        details: JSON.stringify({ count: services.length }),
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
        details: JSON.stringify({ info: 'Initial seed data' }),
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
