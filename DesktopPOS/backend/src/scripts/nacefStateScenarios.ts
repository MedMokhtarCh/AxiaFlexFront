import { AppDataSource } from '../data-source.js';
import {
  getManifest,
  markCertificateGenerated,
  requestCertificate,
  setSmdfStatus,
  signTicket,
  simulateCertificateExpired,
  synchronize,
} from '../services/nacefService.js';

const IMDF = `IMDF-S3-${Date.now()}`;

function assertCondition(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function sampleTicket(id: string) {
  return {
    id,
    operationType: 'SALE',
    transactionType: 'NORMAL',
    totalHt: '10.000',
    taxTotal: '1.900',
    totalTtc: '11.900',
    taxRate: '19.000',
    currency: 'DT',
    issuedAt: Date.now(),
    fiscalLines: [
      {
        lineNo: 1,
        productId: 'TEST',
        name: 'Article test',
        quantity: '1.000',
        unitPriceHt: '10.000',
        lineHt: '10.000',
        lineTax: '1.900',
        lineTtc: '11.900',
        taxRate: '19.000',
      },
    ],
    taxBreakdown: [{ taxRate: '19.000', taxableBase: '10.000', taxAmount: '1.900' }],
  };
}

async function run() {
  await AppDataSource.initialize();
  try {
    console.log(`[nacef-s3] IMDF test: ${IMDF}`);

    const manifest0 = await getManifest(IMDF);
    assertCondition(manifest0.blockingErrorCode === 'SMDF_CERTFICATE_NOT_GENERATED', 'Etat initial invalide');

    const reqCert = await requestCertificate(IMDF);
    assertCondition((reqCert as any).ok === true, 'Demande certificat non acceptee');
    const pendingSign = await signTicket(IMDF, sampleTicket('PENDING-1'));
    assertCondition((pendingSign as any).errorCode === 'SMDF_CERTIFICATE_REQUEST_PENDING', 'Pending cert non bloque');

    await markCertificateGenerated(IMDF, 30);
    const beforeSyncSign = await signTicket(IMDF, sampleTicket('NOSYNC-1'));
    assertCondition((beforeSyncSign as any).errorCode === 'SMDF_NOT_SYNCHRONIZED', 'Signature sans sync non bloquee');

    await synchronize(IMDF, 'OFFLINE');
    for (let i = 0; i < 20; i += 1) {
      const signed = await signTicket(IMDF, sampleTicket(`OFF-${i + 1}`));
      assertCondition((signed as any).ok === true, `Signature offline ${i + 1} echouee`);
    }
    const quotaExhausted = await signTicket(IMDF, sampleTicket('OFF-21'));
    assertCondition(
      ['SMDF_OFFLINE_TICKET_QUOTA_EXHAUSTED', 'SMDF_NOT_SYNCHRONIZED'].includes(
        String((quotaExhausted as any).errorCode || ''),
      ),
      'Quota offline/etat non synchronise non bloque',
    );

    await synchronize(IMDF, 'ONLINE');
    const recovered = await signTicket(IMDF, sampleTicket('RECOVER-1'));
    assertCondition((recovered as any).ok === true, 'Recovery apres sync echouee');

    await simulateCertificateExpired(IMDF);
    const expiredSign = await signTicket(IMDF, sampleTicket('EXP-1'));
    assertCondition((expiredSign as any).errorCode === 'SMDF_EXPIRED_CERTIFICATE', 'Expiration non bloquante');

    await markCertificateGenerated(IMDF, 60);
    await synchronize(IMDF, 'ONLINE');
    await setSmdfStatus(IMDF, 'SUSPENDED');
    const suspendedSign = await signTicket(IMDF, sampleTicket('SUSP-1'));
    assertCondition((suspendedSign as any).errorCode === 'SMDF_IMDF_CAN_NOT_BE_USED', 'Suspension non bloquante');

    await setSmdfStatus(IMDF, 'ACTIVE');
    await synchronize(IMDF, 'ONLINE');
    const afterReactivation = await signTicket(IMDF, sampleTicket('ACTIVE-1'));
    assertCondition((afterReactivation as any).ok === true, 'Reactivation non fonctionnelle');

    await setSmdfStatus(IMDF, 'REVOKED');
    const revokedSign = await signTicket(IMDF, sampleTicket('REV-1'));
    assertCondition((revokedSign as any).errorCode === 'SMDF_REVOKED_CERTIFICATE', 'Revocation non bloquante');

    console.log('[nacef-s3] Tous les scenarios Sprint 3 sont PASS');
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

run().catch((error) => {
  console.error('[nacef-s3] FAILED:', error);
  process.exit(1);
});

