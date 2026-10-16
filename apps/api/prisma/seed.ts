/**
 * Seed réaliste Bailo.
 *   1 compte · 2 sites · 60 chambres · 45 locataires · ~6 mois d'historique
 *   (paiements à jour, partiels, avances, retards).
 *
 * Exécution : `pnpm --filter @bailo/api seed` (base migrée au préalable).
 * Le seed écrit hors contexte de requête : tous les `accountId` sont explicites.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  addMonths,
  allocateFifo,
  formatReceiptNumber,
  generateRentSchedule,
  utcDate,
  yearMonthOf,
} from '@bailo/shared';

const prisma = new PrismaClient();

const PASSWORD = 'demo1234';
const TODAY = new Date();
const START = utcDate(
  addMonths(yearMonthOf(TODAY), -6).year,
  addMonths(yearMonthOf(TODAY), -6).month,
  1,
);

// Compteur de reçus par année (RG9).
const receiptCounters = new Map<number, number>();
function nextReceipt(prefix: string, year: number): string {
  const value = (receiptCounters.get(year) ?? 0) + 1;
  receiptCounters.set(year, value);
  return formatReceiptNumber(prefix, year, value);
}

const FIRST_NAMES = [
  'Paul',
  'Marie',
  'Jean',
  'Aïcha',
  'Ngono',
  'Mballa',
  'Fatou',
  'Eric',
  'Sandrine',
  'Yves',
];
const LAST_NAMES = [
  'Mballa',
  'Ngono',
  'Fotso',
  'Abena',
  'Nkeng',
  'Tchoua',
  'Essomba',
  'Biya',
  'Kana',
  'Moukouri',
];
function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]!;
}

async function main(): Promise<void> {
  console.log('Seed Bailo…');
  const passwordHash = await argon2.hash(PASSWORD);

  const account = await prisma.account.create({
    data: { name: 'Cité Obélix', phone: '690000000', receiptPrefix: 'CG' },
  });

  const owner = await prisma.user.create({
    data: {
      accountId: account.id,
      name: 'Obélix (propriétaire)',
      phone: '690000000',
      passwordHash,
      role: 'OWNER',
    },
  });
  const site1 = await prisma.site.create({
    data: {
      accountId: account.id,
      name: 'Cité Campus',
      type: 'CITE',
      city: 'Yaoundé',
      district: 'Ngoa-Ekellé',
      graceDays: 0,
    },
  });
  const site2 = await prisma.site.create({
    data: {
      accountId: account.id,
      name: 'Immeuble Bastos',
      type: 'IMMEUBLE',
      city: 'Yaoundé',
      district: 'Bastos',
      graceDays: 3,
    },
  });
  await prisma.user.create({
    data: {
      accountId: account.id,
      name: 'Astérix (gérant)',
      phone: '690000001',
      passwordHash,
      role: 'MANAGER',
      sites: { create: [{ siteId: site1.id }, { siteId: site2.id }] },
    },
  });
  const caretaker = await prisma.user.create({
    data: {
      accountId: account.id,
      name: 'Idéfix (gardien)',
      phone: '690000002',
      passwordHash,
      role: 'CARETAKER',
      sites: { create: [{ siteId: site1.id }] },
    },
  });

  // ─── Chambres : 40 (site1, blocs A/B) + 20 (site2) = 60 ────────────────────
  const blockA = await prisma.block.create({
    data: { accountId: account.id, siteId: site1.id, name: 'Bloc A', sortOrder: 1 },
  });
  const blockB = await prisma.block.create({
    data: { accountId: account.id, siteId: site1.id, name: 'Bloc B', sortOrder: 2 },
  });

  interface UnitRec {
    id: string;
    siteId: string;
    code: string;
    rent: number;
  }
  const units: UnitRec[] = [];
  async function makeUnits(
    siteId: string,
    blockId: string | null,
    prefix: string,
    count: number,
    rent: number,
  ): Promise<void> {
    for (let n = 1; n <= count; n += 1) {
      const code = `${prefix}${String(n).padStart(2, '0')}`;
      const u = await prisma.unit.create({
        data: { accountId: account.id, siteId, blockId, code, type: 'CHAMBRE', baseRent: rent },
      });
      units.push({ id: u.id, siteId, code, rent });
    }
  }
  await makeUnits(site1.id, blockA.id, 'A', 20, 25000);
  await makeUnits(site1.id, blockB.id, 'B', 20, 25000);
  await makeUnits(site2.id, null, 'S', 20, 60000); // studios

  // ─── 45 locataires occupant 45 chambres, avec historique ───────────────────
  const collectors = [owner.id, caretaker.id];
  for (let i = 0; i < 45; i += 1) {
    const unit = units[i]!;
    const tenant = await prisma.tenant.create({
      data: {
        accountId: account.id,
        name: `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i * 3)}`,
        phone: `6${String(90000100 + i)}`,
        whatsapp: `+2376${String(90000100 + i)}`,
        occupation: i % 2 === 0 ? 'Étudiant' : 'Commerçant',
      },
    });
    if (i % 3 === 0) {
      await prisma.guarantor.create({
        data: {
          accountId: account.id,
          tenantId: tenant.id,
          name: `Parent de ${tenant.name}`,
          phone: `6${String(90000900 + i)}`,
          relationship: 'Parent',
          isPrimaryPayer: true,
        },
      });
    }

    const deposit = unit.rent;
    const occupancy = await prisma.occupancy.create({
      data: {
        accountId: account.id,
        unitId: unit.id,
        tenantId: tenant.id,
        startDate: START,
        monthlyRent: unit.rent,
        dueDay: 1,
        deposit,
        status: 'ACTIVE',
      },
    });

    const { charges: scheduled, generatedUntil } = generateRentSchedule({
      startDate: START,
      plannedEndDate: null,
      monthlyRent: unit.rent,
      dueDay: 1,
      prorataFirstMonth: false,
    });
    await prisma.occupancy.update({
      where: { id: occupancy.id },
      data: { chargesGeneratedUntil: generatedUntil },
    });

    // Caution (échéance à part) + loyers.
    const cautionCharge = await prisma.charge.create({
      data: {
        accountId: account.id,
        occupancyId: occupancy.id,
        type: 'CAUTION',
        amount: deposit,
        dueDate: START,
        status: 'DUE',
      },
    });
    const rentCharges = [];
    for (const rc of scheduled) {
      rentCharges.push(
        await prisma.charge.create({
          data: {
            accountId: account.id,
            occupancyId: occupancy.id,
            type: 'LOYER',
            periodYear: rc.periodYear,
            periodMonth: rc.periodMonth,
            amount: rc.amount,
            dueDate: rc.dueDate,
            status: 'UPCOMING',
          },
        }),
      );
    }

    // Profil de paiement (varié) : combien de mois payés + éventuel partiel.
    const profile = i % 20;
    let monthsPaid = 6; // à jour par défaut (6 mois écoulés)
    let partial = 0;
    if (profile < 3)
      monthsPaid = 4; // en retard de 2 mois
    else if (profile < 6) {
      monthsPaid = 5;
      partial = Math.round(unit.rent * 0.4);
    } // partiel sur le 6e
    else if (profile < 8) monthsPaid = 9; // 3 mois d'avance
    // sinon : à jour (6)

    const collectorId = pick(collectors, i);
    const openCharges = [
      { chargeId: cautionCharge.id, remaining: deposit },
      ...rentCharges.map((c) => ({ chargeId: c.id, remaining: c.amount })),
    ];
    const amount = deposit + monthsPaid * unit.rent + partial;
    const year = START.getUTCFullYear();
    const payment = await prisma.payment.create({
      data: {
        accountId: account.id,
        occupancyId: occupancy.id,
        clientId: randomUUID(),
        amount,
        mode: i % 2 === 0 ? 'ESPECES' : 'MTN_MOMO',
        paidAt: START,
        receivedBy: collectorId,
        receiptNumber: nextReceipt(account.receiptPrefix, year),
        status: 'VALID',
      },
    });
    const { lines } = allocateFifo(amount, openCharges);
    for (const line of lines) {
      await prisma.allocation.create({
        data: {
          accountId: account.id,
          paymentId: payment.id,
          chargeId: line.chargeId,
          amount: line.amount,
        },
      });
    }
  }

  // Séquences de reçus persistées (RG9).
  for (const [year, value] of receiptCounters) {
    await prisma.receiptSequence.create({
      data: { accountId: account.id, year, lastValue: value },
    });
  }

  console.log('Seed terminé.');
  console.log(`Comptes de test (mot de passe « ${PASSWORD} ») :`);
  console.log('  Propriétaire : 690000000 · Gérant : 690000001 · Gardien : 690000002');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
