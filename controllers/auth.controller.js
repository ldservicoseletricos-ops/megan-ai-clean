import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import { env } from "../config/env.js";
import { getPool } from "../config/db.js";

const db = getPool();

async function query(text, params = []) {
  if (!db) {
    throw new Error("Banco não configurado");
  }

  return db.query(text, params);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function buildJwt(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    env.jwtSecret || process.env.JWT_SECRET || "super_secret_key",
    {
      expiresIn: env.jwtExpiresIn || process.env.JWT_EXPIRES_IN || "7d",
    }
  );
}

function buildSafeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    provider: row.provider,
    emailVerified: row.email_verified,
    avatar: row.avatar || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getFrontendUrl() {
  return String(env.frontendUrl || process.env.FRONTEND_URL || "").trim() || "http://localhost:5173";
}

function getGoogleCallbackUrl() {
  return String(env.googleCallbackUrl || process.env.GOOGLE_CALLBACK_URL || "").trim();
}

function buildGoogleClient() {
  const clientId = env.googleClientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = env.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = getGoogleCallbackUrl();

  return new google.auth.OAuth2(clientId, clientSecret, callbackUrl);
}

export async function registerUser(req, res) {
  try {
    const name = normalizeText(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!name) {
      return res.status(400).json({
        ok: false,
        error: "Nome é obrigatório",
      });
    }

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: "Email é obrigatório",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        error: "A senha deve ter pelo menos 6 caracteres",
      });
    }

    const existing = await query(
      `
      SELECT id
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email]
    );

    if (existing.rows[0]) {
      return res.status(409).json({
        ok: false,
        error: "Já existe uma conta com este email",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `
      INSERT INTO users (
        name,
        email,
        password_hash,
        provider,
        email_verified
      )
      VALUES ($1, $2, $3, 'local', false)
      RETURNING id, name, email, provider, email_verified, avatar, created_at, updated_at
      `,
      [name, email, passwordHash]
    );

    const user = buildSafeUser(result.rows[0]);
    const token = buildJwt(user);

    return res.json({
      ok: true,
      token,
      user,
      message: "Conta criada com sucesso",
    });
  } catch (error) {
    console.error("[AUTH REGISTER ERROR]", error?.message || error);

    return res.status(500).json({
      ok: false,
      error: "Erro ao criar conta",
    });
  }
}

export async function loginUser(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: "Email é obrigatório",
      });
    }

    if (!password) {
      return res.status(400).json({
        ok: false,
        error: "Senha é obrigatória",
      });
    }

    const result = await query(
      `
      SELECT id, name, email, password_hash, provider, email_verified, avatar, created_at, updated_at
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email]
    );

    const userRow = result.rows[0];

    if (!userRow) {
      return res.status(401).json({
        ok: false,
        error: "Email ou senha inválidos",
      });
    }

    if (!userRow.password_hash) {
      return res.status(400).json({
        ok: false,
        error: "Esta conta usa login com Google",
      });
    }

    const validPassword = await bcrypt.compare(password, userRow.password_hash);

    if (!validPassword) {
      return res.status(401).json({
        ok: false,
        error: "Email ou senha inválidos",
      });
    }

    const user = buildSafeUser(userRow);
    const token = buildJwt(user);

    return res.json({
      ok: true,
      token,
      user,
      message: "Login realizado com sucesso",
    });
  } catch (error) {
    console.error("[AUTH LOGIN ERROR]", error?.message || error);

    return res.status(500).json({
      ok: false,
      error: "Erro ao fazer login",
    });
  }
}

export async function getMe(req, res) {
  return res.json({
    ok: true,
    user: req.user || null,
  });
}

export async function googleStartController(req, res) {
  try {
    const clientId = env.googleClientId || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = env.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET;
    const callbackUrl = getGoogleCallbackUrl();

    if (!clientId || !clientSecret || !callbackUrl) {
      return res.status(500).json({
        ok: false,
        error: "Google OAuth não configurado no backend",
        details: {
          hasClientId: Boolean(clientId),
          hasClientSecret: Boolean(clientSecret),
          hasCallbackUrl: Boolean(callbackUrl),
        },
      });
    }

    const client = buildGoogleClient();

    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["openid", "email", "profile"],
    });

    return res.redirect(url);
  } catch (error) {
    console.error("[AUTH GOOGLE START ERROR]", error?.message || error);

    return res.status(500).json({
      ok: false,
      error: "Erro ao iniciar login com Google",
    });
  }
}

export async function googleCallbackController(req, res) {
  try {
    const code = String(req.query?.code || "").trim();

    if (!code) {
      return res.status(400).send("Código do Google ausente");
    }

    const client = buildGoogleClient();
    const { tokens } = await client.getToken(code);

    client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: client,
      version: "v2",
    });

    const { data } = await oauth2.userinfo.get();

    const googleId = String(data.id || "").trim();
    const email = normalizeEmail(data.email);
    const name = normalizeText(data.name || "Usuário Google");
    const avatar = normalizeText(data.picture || "");
    const emailVerified = Boolean(data.verified_email);

    if (!googleId || !email) {
      return res.status(400).send("Não foi possível obter dados do Google");
    }

    const existingByEmail = await query(
      `
      SELECT id, name, email, provider, email_verified, avatar, created_at, updated_at
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email]
    );

    let userRow = existingByEmail.rows[0];

    if (userRow) {
      const updated = await query(
        `
        UPDATE users
        SET
          name = COALESCE(NULLIF($1, ''), name),
          google_id = $2,
          provider = 'google',
          email_verified = $3,
          avatar = COALESCE(NULLIF($4, ''), avatar),
          updated_at = NOW()
        WHERE email = $5
        RETURNING id, name, email, provider, email_verified, avatar, created_at, updated_at
        `,
        [name, googleId, emailVerified, avatar, email]
      );

      userRow = updated.rows[0];
    } else {
      const inserted = await query(
        `
        INSERT INTO users (
          name,
          email,
          google_id,
          provider,
          email_verified,
          avatar
        )
        VALUES ($1, $2, $3, 'google', $4, $5)
        RETURNING id, name, email, provider, email_verified, avatar, created_at, updated_at
        `,
        [name, email, googleId, emailVerified, avatar]
      );

      userRow = inserted.rows[0];
    }

    const user = buildSafeUser(userRow);
    const token = buildJwt(user);
    const frontendUrl = getFrontendUrl();

    const redirectUrl =
      `${frontendUrl}?token=${encodeURIComponent(token)}` +
      `&user=${encodeURIComponent(JSON.stringify(user))}` +
      `&login=google`;

    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("[AUTH GOOGLE CALLBACK ERROR]", error?.message || error);
    return res.status(500).send("Erro no callback do Google");
  }
}

export async function googleLogin(req, res) {
  const hasCode = String(req.query?.code || "").trim();

  if (hasCode) {
    return googleCallbackController(req, res);
  }

  return googleStartController(req, res);
}