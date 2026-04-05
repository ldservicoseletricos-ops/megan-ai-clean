import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getPool } from "../config/db.js";
import { env } from "../config/env.js";

const DEFAULT_PLAN = "free";
const DEFAULT_ROLE = "user";

const USER_SELECT_FIELDS = `
  id,
  external_id,
  email,
  name,
  plan,
  role,
  created_at,
  password_hash,
  email_verified,
  verification_token,
  verification_expires_at,
  google_id,
  avatar_url,
  plan_message_limit,
  plan_reset_at,
  stripe_customer_id,
  stripe_subscription_id,
  billing_status,
  current_period_end,
  updated_at
`;

const USER_PROFILE_FIELDS = `
  id,
  external_id,
  email,
  name,
  plan,
  role,
  created_at,
  email_verified,
  google_id,
  avatar_url,
  plan_message_limit,
  plan_reset_at,
  stripe_customer_id,
  stripe_subscription_id,
  billing_status,
  current_period_end,
  updated_at
`;

function getDb() {
  const db = getPool();

  if (!db) {
    throw new Error("Banco de dados não configurado");
  }

  return db;
}

function getJwtSecret() {
  const secret = String(env.jwtSecret || process.env.JWT_SECRET || "").trim();

  if (!secret) {
    throw new Error("JWT_SECRET não configurado");
  }

  return secret;
}

function getJwtExpiresIn() {
  return String(env.jwtExpiresIn || process.env.JWT_EXPIRES_IN || "7d").trim();
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function normalizeName(name) {
  return String(name || "").trim();
}

export function sanitizeUser(user) {
  if (!user) return null;

  return {
    id: String(user.id),
    externalId: user.external_id || String(user.id),
    email: user.email || "",
    name: user.name || "",
    plan: user.plan || DEFAULT_PLAN,
    role: user.role || DEFAULT_ROLE,
    emailVerified: Boolean(user.email_verified),
    googleId: user.google_id || null,
    avatarUrl: user.avatar_url || null,
    planMessageLimit: user.plan_message_limit ?? 20,
    planResetAt: user.plan_reset_at || null,
    stripeCustomerId: user.stripe_customer_id || null,
    stripeSubscriptionId: user.stripe_subscription_id || null,
    billingStatus: user.billing_status || null,
    currentPeriodEnd: user.current_period_end || null,
    createdAt: user.created_at || null,
    updatedAt: user.updated_at || null,
  };
}

export function signToken(user) {
  const payload = {
    sub: String(user.id),
    id: String(user.id),
    email: user.email || "",
    name: user.name || "",
    plan: user.plan || DEFAULT_PLAN,
    role: user.role || DEFAULT_ROLE,
    externalId: user.external_id || String(user.id),
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: getJwtExpiresIn(),
  });
}

export function verifyJwtToken(token) {
  return jwt.verify(token, getJwtSecret());
}

export async function hashPassword(password) {
  const rawPassword = String(password || "");

  if (!rawPassword.trim()) {
    throw new Error("Senha inválida");
  }

  return bcrypt.hash(rawPassword, 10);
}

export async function comparePassword(password, passwordHash) {
  const rawPassword = String(password || "");
  const hash = String(passwordHash || "");

  if (!rawPassword || !hash) {
    return false;
  }

  return bcrypt.compare(rawPassword, hash);
}

export async function findUserByEmail(email) {
  const db = getDb();
  const normalizedEmail = normalizeEmail(email);

  const result = await db.query(
    `
      SELECT ${USER_SELECT_FIELDS}
      FROM app_users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );

  return result.rows[0] || null;
}

export async function findUserByGoogleId(googleId) {
  const db = getDb();
  const normalizedGoogleId = String(googleId || "").trim();

  const result = await db.query(
    `
      SELECT ${USER_SELECT_FIELDS}
      FROM app_users
      WHERE google_id = $1
      LIMIT 1
    `,
    [normalizedGoogleId]
  );

  return result.rows[0] || null;
}

export async function createPendingUser({
  name,
  email,
  password,
  verificationToken,
  verificationExpiresAt,
}) {
  const db = getDb();

  const normalizedName = normalizeName(name);
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await hashPassword(password);

  const result = await db.query(
    `
      INSERT INTO app_users
      (
        external_id,
        email,
        name,
        password_hash,
        plan,
        role,
        created_at,
        updated_at,
        email_verified,
        verification_token,
        verification_expires_at,
        plan_message_limit,
        plan_reset_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        NOW(),
        NOW(),
        false,
        $7,
        $8,
        20,
        NOW() + interval '1 day'
      )
      RETURNING ${USER_SELECT_FIELDS}
    `,
    [
      normalizedEmail,
      normalizedEmail,
      normalizedName,
      passwordHash,
      DEFAULT_PLAN,
      DEFAULT_ROLE,
      verificationToken,
      verificationExpiresAt,
    ]
  );

  return result.rows[0] || null;
}

export async function createGoogleUser({ googleId, email, name }) {
  const db = getDb();

  const normalizedGoogleId = String(googleId || "").trim();
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = normalizeName(name);

  const result = await db.query(
    `
      INSERT INTO app_users
      (
        external_id,
        email,
        name,
        plan,
        role,
        created_at,
        updated_at,
        email_verified,
        google_id,
        plan_message_limit,
        plan_reset_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        NOW(),
        NOW(),
        true,
        $6,
        20,
        NOW() + interval '1 day'
      )
      RETURNING ${USER_SELECT_FIELDS}
    `,
    [
      normalizedEmail,
      normalizedEmail,
      normalizedName,
      DEFAULT_PLAN,
      DEFAULT_ROLE,
      normalizedGoogleId,
    ]
  );

  return result.rows[0] || null;
}

export async function linkGoogleToExistingUser({ userId, googleId }) {
  const db = getDb();
  const normalizedGoogleId = String(googleId || "").trim();

  const result = await db.query(
    `
      UPDATE app_users
      SET
        google_id = $1,
        email_verified = true,
        updated_at = NOW()
      WHERE id = $2
      RETURNING ${USER_SELECT_FIELDS}
    `,
    [normalizedGoogleId, userId]
  );

  return result.rows[0] || null;
}

export async function findUserByVerificationToken(token) {
  const db = getDb();
  const normalizedToken = String(token || "").trim();

  const result = await db.query(
    `
      SELECT ${USER_SELECT_FIELDS}
      FROM app_users
      WHERE verification_token = $1
      LIMIT 1
    `,
    [normalizedToken]
  );

  return result.rows[0] || null;
}

export async function markUserEmailVerified(userId) {
  const db = getDb();

  await db.query(
    `
      UPDATE app_users
      SET
        email_verified = true,
        verification_token = null,
        verification_expires_at = null,
        updated_at = NOW()
      WHERE id = $1
    `,
    [userId]
  );
}

export async function findUserAuthByEmail(email) {
  return findUserByEmail(email);
}

export async function findUserProfileById(userId) {
  const db = getDb();

  const result = await db.query(
    `
      SELECT ${USER_PROFILE_FIELDS}
      FROM app_users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}