import 'dotenv/config';
import { adminAuth, adminDb } from '../lib/firebase-admin';
import { phoneToEmail } from '../lib/phone-auth';
import { generateReceiptNumber } from '@/services/payment.service';
import { calculateNavyBodyFatPercent } from '@/lib/body-fat';

const BATCH_SIZE = 400; // Firestore caps a batch at 500 writes

async function deleteAllDocs(collectionName: string) {
  const snap = await adminDb.collection(collectionName).get();
  if (snap.empty) return;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = adminDb.batch();
    docs.slice(i, i + BATCH_SIZE).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function main() {
  // This script deletes every document and every Auth user. Refuse to run
  // against anything but the emulator so one accidental run cannot wipe
  // production data.
  if (process.env.FIREBASE_EMULATOR !== 'true') {
    throw new Error(
      'Refusing to seed: FIREBASE_EMULATOR is not "true". This script wipes all Firestore collections and all Auth users.',
    );
  }

  console.log('Seeding Firebase...');

  // ── Clean existing Firestore data ──
  console.log('Cleaning Firestore collections...');
  await Promise.all([
    deleteAllDocs('payments'),
    deleteAllDocs('subscriptions'),
    deleteAllDocs('members'),
    deleteAllDocs('services'),
    deleteAllDocs('users'),
  ]);

  // ── Clean existing Firebase Auth users (all pages) ──
  console.log('Cleaning Firebase Auth users...');
  let token: string | undefined;
  do {
    const listResult = await adminAuth.listUsers(1000, token);
    if (listResult.users.length > 0) {
      await adminAuth.deleteUsers(listResult.users.map((u) => u.uid));
    }
    token = listResult.pageToken || undefined;
  } while (token);

  // ── Create users via Firebase Auth (phone is the login identifier, mapped
  //    to an internal synthetic email — see src/lib/phone-auth.ts) ──
  const ownerPhone = '+251911000000';
  const ownerUser = await adminAuth.createUser({
    email: phoneToEmail(ownerPhone),
    password: 'owner123',
    displayName: 'Owner',
  });
  await adminAuth.setCustomUserClaims(ownerUser.uid, { role: 'owner', phone: ownerPhone });

  const managerPhone = '+251922000000';
  const managerUser = await adminAuth.createUser({
    email: phoneToEmail(managerPhone),
    password: 'manager123',
    displayName: 'Manager',
  });
  await adminAuth.setCustomUserClaims(managerUser.uid, { role: 'manager', phone: managerPhone });

  const readerPhone = '+251933000000';
  const readerUser = await adminAuth.createUser({
    email: phoneToEmail(readerPhone),
    password: 'reader123',
    displayName: 'Reader',
  });
  await adminAuth.setCustomUserClaims(readerUser.uid, { role: 'reader', phone: readerPhone });

  // Store supplementary user profiles in Firestore ({ id, phone } shape)
  const ownerId = ownerUser.uid;
  const managerId = managerUser.uid;
  const readerId = readerUser.uid;

  await adminDb.collection('users').doc(ownerId).set({
    id: ownerId,
    phone: ownerPhone,
  });

  await adminDb.collection('users').doc(managerId).set({
    id: managerId,
    phone: managerPhone,
  });

  await adminDb.collection('users').doc(readerId).set({
    id: readerId,
    phone: readerPhone,
  });

  console.log('Created users:', 'owner@fcms.com', 'manager@fcms.com', 'reader@fcms.com');

  // ── Create 3 services ──
  const gymRef = adminDb.collection('services').doc();
  const karateRef = adminDb.collection('services').doc();
  const aerobicsRef = adminDb.collection('services').doc();
  const now = new Date().toISOString();

  await Promise.all([
    gymRef.set({
      name: 'Gym',
      nameAm: 'ጂም',
      description: 'Full gym access with all equipment and facilities',
      descriptionAm: 'ሙሉ የጂም ተደራሽነት ከሁሉም መሳሪያዎች እና ተቋማት ጋር',
      price: 150000,
      duration: 30,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }),
    karateRef.set({
      name: 'Karate',
      nameAm: 'ካራቴ',
      description: 'Karate training classes with professional instructors',
      descriptionAm: 'በሙያተኞች አሰልጣኞች የሚሰጥ የካራቴ ስልጠና',
      price: 200000,
      duration: 30,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }),
    aerobicsRef.set({
      name: 'Aerobics',
      nameAm: 'ኤሮቢክስ',
      description: 'Aerobics and fitness classes for all levels',
      descriptionAm: 'ለሁሉም ደረጃ የኤሮቢክስ እና የአካል ብቃት ክፍሎች',
      price: 120000,
      duration: 30,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  const gymId = gymRef.id;
  const karateId = karateRef.id;
  const aerobicsId = aerobicsRef.id;

  console.log('Created 3 services: Gym, Karate, Aerobics');

  // ── Create 10 members ──
  const memberData = [
    { firstName: 'Abebe', lastName: 'Kebede', phone: '+251911001001', address: 'Bole, Addis Ababa', weight: 75, height: 175, bloodType: 'O+', sex: 'male', neck: 38, waist: 90, hip: null, emergencyContact: '+251911001002 (Wife)' },
    { firstName: 'Tigist', lastName: 'Haile', phone: '+251922002002', address: 'Kazanchis, Addis Ababa', weight: 58, height: 163, bloodType: 'A+', sex: 'female', neck: 32, waist: 72, hip: 96, emergencyContact: '+251922002003 (Husband)' },
    { firstName: 'Dawit', lastName: 'Amare', phone: '+251933003003', address: 'CMC, Addis Ababa', weight: 80, height: 180, bloodType: 'B+', sex: 'male', neck: 40, waist: 94, hip: null, emergencyContact: '+251933003004 (Brother)' },
    { firstName: 'Mekdes', lastName: 'Tadesse', phone: '+251944004004', address: 'Sarbet, Addis Ababa', weight: 55, height: 158, bloodType: 'AB+', sex: 'female', neck: 30, waist: 68, hip: 95 },
    { firstName: 'Yonas', lastName: 'Gebre', phone: '+251955005005', address: 'Megenagna, Addis Ababa', weight: 70, height: 172, bloodType: 'O-', sex: 'male', neck: 39, waist: 86, hip: null, emergencyContact: '+251955005006 (Father)' },
    { firstName: 'Hiwot', lastName: 'Alemu', phone: '+251966006006', address: 'Piassa, Addis Ababa', weight: 62, height: 165, bloodType: 'A-', sex: 'female', neck: 31, waist: 70, hip: 94 },
    { firstName: 'Solomon', lastName: 'Bekele', phone: '+251977007007', address: 'Lideta, Addis Ababa', weight: 85, height: 178, bloodType: 'B-', sex: 'male', neck: 42, waist: 98, hip: null, emergencyContact: '+251977007008 (Wife)' },
    { firstName: 'Frehiwot', lastName: 'Dinku', phone: '+251988008008', address: 'Kirkos, Addis Ababa', weight: 60, height: 160, bloodType: 'AB-', sex: 'female', neck: 30, waist: 72, hip: 97 },
    { firstName: 'Bereket', lastName: 'Fikadu', phone: '+251999009009', address: 'Gulele, Addis Ababa', weight: 72, height: 170, bloodType: 'O+', sex: 'male', neck: 38, waist: 84, hip: null, emergencyContact: '+251999009010 (Mother)' },
    { firstName: 'Selamawit', lastName: 'Girma', phone: '+251910010010', address: 'Nifas Silk, Addis Ababa', weight: 57, height: 162, bloodType: 'A+', sex: 'female', neck: 31, waist: 69, hip: 93, emergencyContact: '+251910010011 (Sister)' },
  ];

  const memberRefs = await Promise.all(
    memberData.map((m) => {
      const ref = adminDb.collection('members').doc();
      return ref.set({
        firstName: m.firstName,
        lastName: m.lastName,
        phone: m.phone,
        photo: null,
        address: m.address,
        weight: m.weight,
        height: m.height,
        bloodType: m.bloodType,
        sex: m.sex,
        neck: m.neck,
        waist: m.waist,
        hip: m.hip,
        bodyFatPercent: calculateNavyBodyFatPercent({
sex: m.sex as 'male' | 'female',
          heightCm: m.height,
          neckCm: m.neck,
          waistCm: m.waist,
          hipCm: m.hip,
        }),
        emergencyContact: m.emergencyContact || null,
        notes: null,
        isDeleted: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      }).then(() => ref.id);
    }),
  );

  const members = memberRefs;
  console.log(`Created ${members.length} members`);

  // ── Create 11 subscriptions and 10 payments ──
  const date = new Date();
  const ts = date.toISOString();

  // Helper to create a subscription + optional payment in a batch
  async function createSubWithPayment(
    memberIndex: number,
    serviceId: string,
    startOffsetMonths: number,
    endOffsetMonths: number,
    status: string,
    price: number,
    paymentInfo?: { method: string; dayOffset: number; createdBy: string },
    notes?: string,
  ): Promise<string> {
    const start = new Date(date.getFullYear(), date.getMonth() + startOffsetMonths, 1);
    const end = new Date(date.getFullYear(), date.getMonth() + endOffsetMonths, 0);

    const subRef = adminDb.collection('subscriptions').doc();
    const batch = adminDb.batch();

    batch.set(subRef, {
      memberId: members[memberIndex],
      serviceId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      status,
      priceSnapshot: price,
      notes: notes || null,
      createdAt: ts,
      updatedAt: ts,
    });

    if (paymentInfo) {
      const payDate = new Date(date.getFullYear(), date.getMonth() + paymentInfo.dayOffset, 3);
      const payRef = adminDb.collection('payments').doc();
      batch.set(payRef, {
        subscriptionId: subRef.id,
        memberId: members[memberIndex],
        amount: price,
        paymentDate: payDate.toISOString(),
        method: paymentInfo.method,
        receiptNumber: generateReceiptNumber(),
        createdBy: paymentInfo.createdBy,
        isVoided: false,
        voidedAt: null,
        voidedBy: null,
        notes: null,
        extendedTo: end.toISOString(),
        previousExtendedTo: null,
        createdAt: ts,
        updatedAt: ts,
      });
    }

    await batch.commit();
    return subRef.id;
  }

  // Member 0: Abebe - Gym, active (paid cash)
  await createSubWithPayment(0, gymId, 0, 1, 'active', 150000, { method: 'cash', dayOffset: 0, createdBy: ownerId });

  // Member 1: Tigist - Karate, active (paid bank_transfer)
  await createSubWithPayment(1, karateId, 0, 1, 'active', 200000, { method: 'bank_transfer', dayOffset: 0, createdBy: managerId });

  // Member 2: Dawit - Gym, active (paid cash)
  await createSubWithPayment(2, gymId, 0, 1, 'active', 150000, { method: 'cash', dayOffset: 0, createdBy: ownerId });

  // Member 3: Mekdes - Aerobics, expired (was paid)
  await createSubWithPayment(3, aerobicsId, -2, -1, 'expired', 120000, { method: 'cash', dayOffset: -2, createdBy: managerId });

  // Member 4: Yonas - Karate, active (paid mobile_money)
  await createSubWithPayment(4, karateId, 0, 1, 'active', 200000, { method: 'mobile_money', dayOffset: 0, createdBy: ownerId });

  // Member 5: Hiwot - Aerobics, active (paid cash)
  await createSubWithPayment(5, aerobicsId, 0, 1, 'active', 120000, { method: 'cash', dayOffset: 0, createdBy: ownerId });

  // Member 6: Solomon - Gym, active (paid bank transfer)
  await createSubWithPayment(6, gymId, -1, 1, 'active', 150000, { method: 'bank_transfer', dayOffset: -1, createdBy: managerId });

  // Member 7: Frehiwot - Karate, active (paid mobile_money)
  await createSubWithPayment(7, karateId, 0, 1, 'active', 200000, { method: 'mobile_money', dayOffset: 0, createdBy: ownerId });

  // Member 8: Bereket - Gym, cancelled
  await createSubWithPayment(8, gymId, -3, -2, 'cancelled', 150000, undefined, 'Cancelled at member request');

  // Member 9: Selamawit - Gym + Aerobics, both active (paid cash for both)
  await createSubWithPayment(9, gymId, 0, 1, 'active', 150000, { method: 'cash', dayOffset: 0, createdBy: ownerId });
  await createSubWithPayment(9, aerobicsId, 0, 1, 'active', 120000, { method: 'cash', dayOffset: 0, createdBy: managerId });

  console.log('Created 11 subscriptions and 10 payments');

  console.log('Seeding complete!');
}

main().catch((e) => {
  console.error('Seeding failed:', e);
  process.exit(1);
});
