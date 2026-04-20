import { AppDataSource } from '../data-source.js';
import * as nacefService from '../services/nacefService.js';

const IMDF = `IMDF-S2-${Date.now()}`;

function assertCondition(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: `A3-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    operationType: 'SALE',
    transactionType: 'NORMAL',
    totalHt: '30.000',
    taxTotal: '4.700',
    totalTtc: '35.300',
    taxRate: '0.000',
    currency: 'DT',
    sellerTaxId: 'MF-TEST-001',
    issuedAt: Date.now(),
    fiscalLines: [
      {
        lineNo: 1,
        productId: 'A',
        name: 'Article A',
        quantity: '1.000',
        unitPriceHt: '10.000',
        lineHt: '10.000',
        lineTax: '1.900',
        lineTtc: '11.900',
        taxRate: '19.000',
      },
      {
        lineNo: 2,
        productId: 'B',
        name: 'Article B',
        quantity: '1.000',
        unitPriceHt: '20.000',
        lineHt: '20.000',
        lineTax: '2.800',
        lineTtc: '22.800',
        taxRate: '14.000',
      },
    ],
    taxBreakdown: [
      { taxRate: '19.000', taxableBase: '10.000', taxAmount: '1.900' },
      { taxRate: '14.000', taxableBase: '20.000', taxAmount: '2.800' },
    ],
    ...overrides,
  } as any;
}

async function run() {
  await AppDataSource.initialize();
  try {
    await nacefService.requestCertificate(IMDF);
    await nacefService.markCertificateGenerated(IMDF, 365);
    await nacefService.synchronize(IMDF, 'ONLINE');

    // S2-01: transactionType acceptes
    for (const txType of ['NORMAL', 'FORMATION', 'REMBOURSEMENT', 'COPIE']) {
      const signed = await nacefService.signTicket(IMDF, basePayload({ transactionType: txType }));
      assertCondition((signed as any)?.ok === true, `transactionType ${txType} non accepte`);
    }

    // S2-02/S2-03/S2-04/S2-05: payload A3 valide (formats + lignes + breakdown + multi-taux)
    const signedA3 = await nacefService.signTicket(IMDF, basePayload());
    assertCondition((signedA3 as any)?.ok === true, 'Payload A3 valide non signe');
    assertCondition(
      String((signedA3 as any)?.signedTicket?.qrCodePayload || '').length > 0,
      'QR fiscal absent',
    );

    // Variation OFFLINE pour verifier mode de signature offline
    await nacefService.synchronize(IMDF, 'OFFLINE');
    const offlineSigned = await nacefService.signTicket(IMDF, basePayload({ id: 'A3-OFFLINE-1' }));
    assertCondition((offlineSigned as any)?.ok === true, 'Signature OFFLINE echouee');
    assertCondition((offlineSigned as any)?.signedTicket?.mode === 'OFFLINE', 'Mode OFFLINE non applique');
    await nacefService.synchronize(IMDF, 'ONLINE');

    // S2-06: rejection payload invalide (format 0.000)
    const invalidSign = await nacefService.signTicket(IMDF, {
      id: 'BAD-1',
      operationType: 'SALE',
      transactionType: 'NORMAL',
      totalHt: '10.00',
      taxTotal: '1.900',
    } as any);
    assertCondition(
      String((invalidSign as any)?.errorCode || '') === 'SMDF_INVALID_TICKET_FORMAT',
      'Payload invalide non rejete',
    );

    // S2-06 bis: transactionType invalide
    const invalidTx = await nacefService.signTicket(
      IMDF,
      basePayload({ id: 'BAD-2', transactionType: 'UNKNOWN' }),
    );
    assertCondition(
      String((invalidTx as any)?.errorCode || '') === 'SMDF_INVALID_TICKET_FORMAT',
      'transactionType invalide non rejete',
    );

    // S2-07: incoherence fiscalLines vs totalHt
    const badLineHt = await nacefService.signTicket(
      IMDF,
      basePayload({
        id: 'BAD-3',
        totalHt: '29.000',
      }),
    );
    assertCondition(
      String((badLineHt as any)?.errorCode || '') === 'SMDF_JSON_E0803',
      'Incoherence fiscalLines/totalHt non rejetee',
    );

    // S2-08: incoherence taxBreakdown vs taxTotal
    const badBreakdownTax = await nacefService.signTicket(
      IMDF,
      basePayload({
        id: 'BAD-4',
        taxBreakdown: [
          { taxRate: '19.000', taxableBase: '10.000', taxAmount: '1.900' },
          { taxRate: '14.000', taxableBase: '20.000', taxAmount: '2.700' },
        ],
      }),
    );
    assertCondition(
      String((badBreakdownTax as any)?.errorCode || '') === 'SMDF_JSON_E0803',
      'Incoherence taxBreakdown/taxTotal non rejetee',
    );

    // S2-09: taxCode invalide (format)
    const badTaxCode = await nacefService.signTicket(
      IMDF,
      basePayload({
        id: 'BAD-5',
        fiscalLines: [
          {
            lineNo: 1,
            productId: 'A',
            name: 'Article A',
            quantity: '1.000',
            unitPriceHt: '10.000',
            lineHt: '10.000',
            lineTax: '1.900',
            lineTtc: '11.900',
            taxRate: '19.000',
            taxCode: 'TVA-STD',
          },
          {
            lineNo: 2,
            productId: 'B',
            name: 'Article B',
            quantity: '1.000',
            unitPriceHt: '20.000',
            lineHt: '20.000',
            lineTax: '2.800',
            lineTtc: '22.800',
            taxRate: '14.000',
            taxCode: 'TVA_RED',
          },
        ],
      }),
    );
    assertCondition(
      String((badTaxCode as any)?.errorCode || '') === 'SMDF_JSON_E0803',
      'taxCode invalide non rejete',
    );

    // S2-10: familyCode invalide (format)
    const badFamilyCode = await nacefService.signTicket(
      IMDF,
      basePayload({
        id: 'BAD-6',
        fiscalLines: [
          {
            lineNo: 1,
            productId: 'A',
            name: 'Article A',
            quantity: '1.000',
            unitPriceHt: '10.000',
            lineHt: '10.000',
            lineTax: '1.900',
            lineTtc: '11.900',
            taxRate: '19.000',
            familyCode: 'F',
          },
          {
            lineNo: 2,
            productId: 'B',
            name: 'Article B',
            quantity: '1.000',
            unitPriceHt: '20.000',
            lineHt: '20.000',
            lineTax: '2.800',
            lineTtc: '22.800',
            taxRate: '14.000',
            familyCode: 'FAM_B',
          },
        ],
      }),
    );
    assertCondition(
      String((badFamilyCode as any)?.errorCode || '') === 'SMDF_JSON_E0803',
      'familyCode invalide non rejete',
    );

    console.log('[nacef-s2] Tous les scenarios Sprint 2 sont PASS');
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

run().catch((error) => {
  console.error('[nacef-s2] FAILED:', error);
  process.exit(1);
});

