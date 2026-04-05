import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getPool } from "../config/db.js";
import { env } from "../config/env.js";

function getDb() {
  const db = getPool();

  if (!db) {
    throw new Error("Banco de dados não configurado");
  }

  return db;
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function normalizeName(name) {
  return String(name || "").trim();
}

export function sanitizeUser(user) {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name || "",
    plan: user.plan || "free",
    externalId: user.external_id || user.id,
    createdAt: user.created_at || null,
    emailVerified: Boolean(user.email_verified),
    role: user.role || "user",
    googleId: user.google_id || null,
  };
}

export function signToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      name: user.name || "",
      plan: user.plan || "free",
      role: user.role || "user",
      externalId: user.external_id || user.id,
    },
    env.jwtSecret,
    {
      expiresIn: env.jwtExpiresIn,
    }
  );
}

export function verifyJwtToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash || "");
}

export async function findUserByEmail(email) {
  const db = getDb();

  const result = await db.query(
    `
      SELECT
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
        plan_message_limit,
        plan_reset_at,
        stripe_customer_id,
        stripe_subscription_id,
        billing_status,
        current_period_end
      FROM app_users
      WHERE email = $1
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] || null;
}

export async function findUserByGoogleId(googleId) {
  const db = getDb();

  const result = await db.query(
    `
      SELECT
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
        plan_message_limit,
        plan_reset_at,
        stripe_customer_id,
        stripe_subscription_id,
        billing_status,
        current_period_end
      FROM app_users
      WHERE google_id = $1
      LIMIT 1
    `,
    [googleId]
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
        'free',
        'user',
        NOW(),
        false,
        $5,
        $6,
        20,
        NOW() + interval '1 day'
      )
      RETURNING
        id,
        external_id,
        email,
        name,
        plan,
        role,
        created_at,
        email_verified,
        verification_token,
        verification_expires_at,
        google_id,
        plan_message_limit,
        plan_reset_at
    `,
    [
      email,
      email,
      name,
      passwordHash,
      verificationToken,
      verificationExpiresAt,
    ]
  );

  return result.rows[0];
}

export async function createGoogleUser({
  googleId,
  email,
  name,
}) {
  const db = getDb();

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
        'free',
        'user',
        NOW(),
        true,
        $4,
        20,
        NOW() + interval '1 day'
      )
      RETURNING
        id,
        external_id,
        email,
        name,
        plan,
        role,
        created_at,
        email_verified,
        google_id,
        plan_message_limit,
        plan_reset_at
    `,
    [email, email, name, googleId]
  );

  return result.rows[0];
}

export async function linkGoogleToExistingUser({
  userId,
  googleId,
}) {
  const db = getDb();

  const result = await db.query(
    `
      UPDATE app_users
      SET
        google_id = $1,
        email_verified = true
      WHERE id = $2
      RETURNING
        id,
        external_id,
        email,
        name,
        plan,
        role,
        created_at,
        email_verified,
        google_id,
        plan_message_limit,
        plan_reset_at
    `,
    [googleId, userId]
  );

  return result.rows[0] || null;
}

export async function findUserByVerificationToken(token) {
  const db = getDb();

  const result = await db.query(
    `
      SELECT
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
        plan_message_limit,
        plan_reset_at
      FROM app_users
      WHERE verification_token = $1
      LIMIT 1
    `,
    [token]
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
        verification_expires_at = null
      WHERE id = $1
    `,
    [userId]
  );
}

export async function findUserAuthByEmail(email) {
  const db = getDb();

  const result = await db.query(
    `
      SELECT
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
        plan_message_limit,
        plan_reset_at
      FROM app_users
      WHERE email = $1
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] || null;
}

export async function findUserProfileById(userId) {
  const db = getDb();

  const result = await db.query(
    `
      SELECT
        id,
        external_id,
        email,
        name,
        plan,
        role,
        created_at,
        email_verified,
        google_id,
        plan_message_limit,
        plan_reset_at
      FROM app_users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}