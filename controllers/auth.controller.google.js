import { OAuth2Client } from "google-auth-library";
import {
  normalizeEmail,
  normalizeName,
  sanitizeUser,
  signToken,
  verifyJwtToken,
  findUserByEmail,
  findUserByGoogleId,
  createPendingUser,
  createGoogleUser,
  linkGoogleToExistingUser,
  findUserByVerificationToken,
  markUserEmailVerified,
  findUserAuthByEmail,
  findUserProfileById,
  comparePassword,
} from "../services/auth.service.js";
import {
  generateVerificationToken,
  sendVerificationEmail,
} from "../services/email.service.js";
import { env } from "../config/env.js";
import { logError } from "../utils/logger.js";

const googleClient = env.googleClientId
  ? new OAuth2Client(env.googleClientId, env.googleClientSecret, env.googleCallbackUrl)
  : null;

function frontendUrl(path = "") {
  return `${String(env.frontendUrl || "").replace(/\/+$/, "")}${path}`;
}

function encodeUser(user) {
  return encodeURIComponent(JSON.stringify(sanitizeUser(user)));
}

function redirectWithAuth(res, user) {
  const token = signToken(user);
  const target = `${frontendUrl("/")}?token=${encodeURIComponent(token)}&user=${encodeUser(user)}&login=success`;
  return res.redirect(target);
}

function redirectWithError(res, message) {
  const target = `${frontendUrl("/")}?login=error&message=${encodeURIComponent(message)}`;
  return res.redirect(target);
}

async function upsertGoogleUserFromPayload(payload) {
  const googleId = String(payload?.sub || "").trim();
  const email = normalizeEmail(payload?.email);
  const name = normalizeName(payload?.name || "Google User");

  if (!googleId || !email) {
    throw new Error("Dados do Google inválidos");
  }

  let user = await findUserByGoogleId(googleId);
  if (user) return user;

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    user = await linkGoogleToExistingUser({ userId: existingUser.id, googleId });
    return user;
  }

  user = await createGoogleUser({ googleId, email, name });
  return user;
}

export async function register(req, res) {
  try {
    const name = normalizeName(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: "Dados obrigatórios" });
    }

    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: "Senha muito curta" });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ ok: false, error: "Email já cadastrado" });
    }

    const token = generateVerificationToken();
    const createdUser = await createPendingUser({
      name,
      email,
      password,
      verificationToken: token,
      verificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const emailResult = await sendVerificationEmail({ to: email, name, token });

    if (emailResult?.skipped) {
      return res.status(201).json({
        ok: true,
        message: "Conta criada. SMTP não configurado, então confirme pelo link manual.",
        verifyToken: token,
        user: sanitizeUser(createdUser),
      });
    }

    return res.status(201).json({
      ok: true,
      message: "Conta criada. Verifique seu email.",
      user: sanitizeUser(createdUser),
    });
  } catch (error) {
    logError("Erro register", error);
    return res.status(500).json({ ok: false, error: "Erro ao criar conta" });
  }
}

export async function login(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email e senha são obrigatórios" });
    }

    const user = await findUserAuthByEmail(email);
    if (!user) {
      return res.status(401).json({ ok: false, error: "Email ou senha inválidos" });
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ ok: false, error: "Email ou senha inválidos" });
    }

    if (!user.email_verified) {
      return res.status(403).json({ ok: false, error: "Confirme seu email antes de entrar" });
    }

    const token = signToken(user);
    return res.json({ ok: true, token, user: sanitizeUser(user) });
  } catch (error) {
    logError("Erro login", error);
    return res.status(500).json({ ok: false, error: "Erro no login" });
  }
}

export async function googleLogin(req, res) {
  try {
    if (!env.googleClientId || !env.googleClientSecret || !env.googleCallbackUrl) {
      return res.status(500).json({ ok: false, error: "Google login não configurado" });
    }

    const params = new URLSearchParams({
      client_id: env.googleClientId,
      redirect_uri: env.googleCallbackUrl,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });

    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  } catch (error) {
    logError("Erro ao iniciar Google login", error);
    return res.status(500).json({ ok: false, error: "Erro ao iniciar Google login" });
  }
}

export async function googleCallback(req, res) {
  try {
    if (!googleClient) {
      return redirectWithError(res, "Google login não configurado");
    }

    const code = String(req.query?.code || "").trim();
    if (!code) {
      return redirectWithError(res, "Código do Google ausente");
    }

    const { tokens } = await googleClient.getToken({
      code,
      redirect_uri: env.googleCallbackUrl,
    });

    if (!tokens?.id_token) {
      return redirectWithError(res, "Google não retornou id_token");
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.googleClientId,
    });

    const payload = ticket.getPayload();
    const user = await upsertGoogleUserFromPayload(payload);

    return redirectWithAuth(res, user);
  } catch (error) {
    logError("Erro callback Google", error);
    return redirectWithError(res, "Falha ao autenticar com Google");
  }
}

export async function verifyEmail(req, res) {
  try {
    const token = String(req.body?.token || req.query?.token || "").trim();

    if (!token) {
      return res.status(400).json({ ok: false, error: "Token obrigatório" });
    }

    const user = await findUserByVerificationToken(token);
    if (!user) {
      return res.status(404).json({ ok: false, error: "Token inválido ou expirado" });
    }

    const verifiedUser = await markUserEmailVerified(user.id);
    return res.json({
      ok: true,
      message: "Email confirmado com sucesso",
      user: sanitizeUser(verifiedUser),
    });
  } catch (error) {
    logError("Erro verifyEmail", error);
    return res.status(500).json({ ok: false, error: "Erro ao confirmar email" });
  }
}

export async function resendVerification(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({ ok: false, error: "Email obrigatório" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ ok: false, error: "Usuário não encontrado" });
    }

    if (user.email_verified) {
      return res.json({ ok: true, message: "Email já confirmado" });
    }

    const token = generateVerificationToken();
    const verifiedUser = await createPendingUser; // placeholder to preserve import expectations
    void verifiedUser;

    // Atualiza token diretamente, sem mexer no resto do serviço.
    const dbUserUpdater = (await import("../config/db.js")).getPool();
    await dbUserUpdater.query(
      `
        UPDATE app_users
        SET verification_token = $1,
            verification_expires_at = NOW() + interval '1 day'
        WHERE id = $2
      `,
      [token, user.id]
    );

    const emailResult = await sendVerificationEmail({
      to: user.email,
      name: user.name,
      token,
    });

    return res.json({
      ok: true,
      message: emailResult?.skipped
        ? "SMTP não configurado. Use o token manual para confirmar."
        : "Email de verificação reenviado",
      verifyToken: emailResult?.skipped ? token : undefined,
    });
  } catch (error) {
    logError("Erro resendVerification", error);
    return res.status(500).json({ ok: false, error: "Erro ao reenviar verificação" });
  }
}

export async function forgotPassword(_req, res) {
  return res.status(501).json({ ok: false, error: "Forgot password ainda não implementado" });
}

export async function resetPassword(_req, res) {
  return res.status(501).json({ ok: false, error: "Reset password ainda não implementado" });
}

export async function magicLinkLogin(_req, res) {
  return res.status(501).json({ ok: false, error: "Magic link ainda não implementado" });
}

export async function magicLinkVerify(_req, res) {
  return res.status(501).json({ ok: false, error: "Magic link verify ainda não implementado" });
}

export async function me(req, res) {
  try {
    const userId = req.user?.sub || req.user?.id;
    const user = await findUserProfileById(userId);
    return res.json({ ok: true, user: sanitizeUser(user) });
  } catch (error) {
    logError("Erro me", error);
    return res.status(500).json({ ok: false, error: "Erro ao obter perfil" });
  }
}

export function requireAuth(req, res, next) {
  try {
    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
      return res.status(401).json({ ok: false, error: "Não autorizado" });
    }

    req.user = verifyJwtToken(token);
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: "Token inválido" });
  }
}
