/**
 * Nightly off-site backup of the cloud Postgres database.
 *
 * WHY THIS EXISTS: before this, every school's data lived in exactly one place — the Neon
 * database — on a free plan with a short restore window, no SLA and no support. Neon's own
 * point-in-time restore is not a backup you control: it disappears with the account, the
 * billing status, or the vendor. This puts an encrypted copy on a THIRD provider (Cloudflare
 * R2) written by a job on a FOURTH (GitHub Actions), so that losing any one of Neon, Railway
 * or Vercel — to an outage, a suspension or a lapsed card — never costs a school its records.
 *
 * Deliberately runs OUTSIDE Railway. A backup job hosted on the same platform it is meant to
 * protect you from is not a backup.
 *
 * Run locally against the dev database with:
 *   DATABASE_URL=... S3_ENDPOINT=http://localhost:9000 R2_BUCKET=... \
 *   R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... BACKUP_GPG_PASSPHRASE=... node backup.mjs
 */

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  S3Client, PutObjectCommand, HeadObjectCommand,
  ListObjectsV2Command, DeleteObjectsCommand,
} from '@aws-sdk/client-s3'

// ── Config ────────────────────────────────────────────────────────────────────

const env = (name, fallback = undefined) => {
  const v = process.env[name]
  if (v == null || v === '') {
    if (fallback !== undefined) return fallback
    throw new Error(`Missing required env var: ${name}`)
  }
  return v
}

const DATABASE_URL = env('DATABASE_URL')
const BUCKET = env('R2_BUCKET')
const GPG_PASSPHRASE = env('BACKUP_GPG_PASSPHRASE')
// `pg_dump` REFUSES to dump a server newer than itself, and production Neon is on PG 18.
// GitHub's runners ship an older client by default, so the workflow installs 18 explicitly
// and points here at it. Getting this wrong fails every single night, loudly — which is the
// good outcome; the bad one would be a silently partial dump.
const PG_DUMP = env('PG_DUMP', 'pg_dump')
const PG_RESTORE = env('PG_RESTORE', 'pg_restore')

// R2's S3 endpoint. Overridable so the whole pipeline can be tested against a local MinIO
// without touching the real bucket.
const ENDPOINT = process.env.S3_ENDPOINT || `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`

const RETAIN_DAILY = Number(env('RETAIN_DAILY', '30'))
const RETAIN_MONTHLY = Number(env('RETAIN_MONTHLY', '12'))

// `auto` is what R2 expects; a real AWS region name would also be accepted but means nothing.
const s3 = new S3Client({
  region: 'auto',
  endpoint: ENDPOINT,
  forcePathStyle: true, // MinIO needs it, R2 accepts it
  credentials: {
    accessKeyId: env('R2_ACCESS_KEY_ID'),
    secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
  },
})

const log = (...args) => console.log(`[backup ${new Date().toISOString()}]`, ...args)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Run a command to completion, rejecting on a non-zero exit. stdin is optional — used to
 *  hand gpg the passphrase without it ever appearing in the process list (`ps` shows argv
 *  to every user on the machine, so `--passphrase <secret>` would leak it). */
function run(cmd, args, { stdin } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [stdin == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] })
    let out = '', err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(`${cmd} exited ${code}: ${err.trim() || out.trim()}`))
    })
    if (stdin != null) { child.stdin.write(stdin); child.stdin.end() }
  })
}

/** Backups are named so that a plain lexicographic sort is also a chronological sort —
 *  that is what lets pruning work off a sorted key listing with no date parsing. */
const stamp = (d) => d.toISOString().replace(/[:.]/g, '-').replace('Z', 'Z')

// ── Steps ─────────────────────────────────────────────────────────────────────

/**
 * `--format=custom` is already compressed and is the only format `pg_restore` can restore
 * selectively from, which matters when the realistic disaster is "one school's rows were
 * destroyed", not "the whole cluster is gone".
 *
 * `--no-owner` / `--no-acl`: the dump must restore into a database whose roles do not match
 * production's (`neondb_owner` exists only on Neon). Without these, a restore onto a scratch
 * server fails on every GRANT — precisely when you are least able to debug it.
 */
async function dumpDatabase(dir) {
  const file = path.join(dir, 'db.dump')
  log('running pg_dump…')
  await run(PG_DUMP, ['--format=custom', '--no-owner', '--no-acl', '--file', file, DATABASE_URL])
  const { size } = await stat(file)
  // A 0-byte or absurdly small dump means pg_dump "succeeded" against an empty or wrong
  // database. Uploading that over a good backup is how you lose data while believing you
  // are protected, so refuse it here rather than let the retention window rotate it in.
  if (size < 1024) throw new Error(`pg_dump produced only ${size} bytes — refusing to upload`)
  log(`pg_dump ok: ${(size / 1024 / 1024).toFixed(2)} MB`)
  return file
}

/**
 * Verify the archive is actually restorable BEFORE it is trusted, not on the day you need it.
 * `pg_restore --list` parses the archive's table of contents; if the file is truncated or
 * corrupt this fails here, while there is still a good backup in the bucket.
 */
async function verifyArchive(file) {
  const toc = await run(PG_RESTORE, ['--list', file])
  const tables = (toc.match(/TABLE DATA/g) || []).length
  if (tables === 0) throw new Error('archive lists no table data — refusing to upload')
  log(`archive verified: ${tables} tables present`)
}

/** Symmetric AES-256. The passphrase goes in on fd 0, never in argv. */
async function encrypt(file) {
  const out = `${file}.gpg`
  await run('gpg', [
    '--batch', '--yes', '--symmetric', '--cipher-algo', 'AES256',
    '--passphrase-fd', '0', '--output', out, file,
  ], { stdin: GPG_PASSPHRASE })
  const { size } = await stat(out)
  log(`encrypted: ${(size / 1024 / 1024).toFixed(2)} MB`)
  return out
}

/** Upload, then HEAD it back and compare sizes. An upload that reports success but stored
 *  a truncated object is a real S3 failure mode; checking costs one request out of a
 *  million-per-month free allowance. */
async function upload(file, key) {
  const body = await readFile(file)
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body }))
  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
  if (head.ContentLength !== body.length) {
    throw new Error(`upload size mismatch for ${key}: sent ${body.length}, stored ${head.ContentLength}`)
  }
  log(`uploaded + verified ${key}`)
}

/** Keep the newest `keep` objects under `prefix`, delete the rest. Keys sort chronologically
 *  by construction (see `stamp`), so this needs no date parsing and cannot be confused by a
 *  clock change or a timezone. */
async function prune(prefix, keep) {
  const keys = []
  let token
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: prefix, ContinuationToken: token,
    }))
    for (const o of page.Contents ?? []) keys.push(o.Key)
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)

  keys.sort()
  const doomed = keys.slice(0, Math.max(0, keys.length - keep))
  if (doomed.length === 0) {
    log(`prune ${prefix}: ${keys.length} kept, nothing to delete`)
    return
  }
  await s3.send(new DeleteObjectsCommand({
    Bucket: BUCKET,
    Delete: { Objects: doomed.map((Key) => ({ Key })) },
  }))
  log(`prune ${prefix}: deleted ${doomed.length}, kept ${keys.length - doomed.length}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date()
  const dir = await mkdtemp(path.join(tmpdir(), 'bulletin-backup-'))
  try {
    const dump = await dumpDatabase(dir)
    await verifyArchive(dump)
    const encrypted = await encrypt(dump)

    await upload(encrypted, `db/daily/${stamp(now)}.dump.gpg`)

    // One monthly copy, taken on the 1st, kept for a year. The daily window answers "someone
    // broke it this month"; the monthly archive answers "what did this school's records look
    // like at the end of the last academic year", which is the request a school actually makes.
    if (now.getUTCDate() === 1) {
      const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
      await upload(encrypted, `db/monthly/${month}.dump.gpg`)
    }

    await prune('db/daily/', RETAIN_DAILY)
    await prune('db/monthly/', RETAIN_MONTHLY)
    log('done')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  // Non-zero exit is what makes GitHub Actions mark the run failed and email you. A backup
  // job that fails quietly is indistinguishable from one that never ran.
  console.error(`[backup] FAILED: ${err.message}`)
  process.exit(1)
})
