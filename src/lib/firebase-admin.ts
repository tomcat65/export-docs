import admin from 'firebase-admin'

/**
 * Vercel env vars store multi-line strings with literal `\n` sequences
 * rather than real newlines. `admin.credential.cert` requires real newlines
 * in the PEM body, so decode before passing it through.
 */
export function decodePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, '\n')
}

function init(): admin.app.App | null {
  if (admin.apps.length > 0) {
    return admin.app()
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET

  if (!projectId || !clientEmail || !privateKeyRaw || !storageBucket) {
    // Import-time no-op contexts:
    //   - NODE_ENV==='test': unit tests that don't mock the module.
    //   - NEXT_PHASE==='phase-production-build': `next build` evaluates
    //     route modules to collect page data; env vars aren't present
    //     at build time on Vercel for server-only vars.
    // Callers that touch `db`/`bucket` at request time without env
    // vars configured will hit a runtime NPE via the undefined cast,
    // which the probe route + future hooks surface as a 500.
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.NEXT_PHASE === 'phase-production-build'
    ) {
      return null
    }

    const missing = [
      !projectId && 'FIREBASE_PROJECT_ID',
      !clientEmail && 'FIREBASE_CLIENT_EMAIL',
      !privateKeyRaw && 'FIREBASE_PRIVATE_KEY',
      !storageBucket && 'FIREBASE_STORAGE_BUCKET',
    ]
      .filter(Boolean)
      .join(', ')
    throw new Error(`firebase-admin init missing env vars: ${missing}`)
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: decodePrivateKey(privateKeyRaw),
    }),
    storageBucket,
  })
}

const app = init()

export const db = (app ? admin.firestore(app) : undefined) as admin.firestore.Firestore
export const bucket = (
  app ? admin.storage(app).bucket() : undefined
) as ReturnType<ReturnType<typeof admin.storage>['bucket']>
export { admin }
