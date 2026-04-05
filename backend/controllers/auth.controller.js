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
import { getPool } from "../config/db.js";
import { logError, logWarn } from "../utils/logger.js";

const googleClient = env.googleClientId
  ? new OAuth2Client(env.googleClientId)
  : null;

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || "");
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function getCallbackUrl() {
  return (
    env.googleCallbackUrl ||
    "https://megan-ai.onrender.com/api/auth/google/callback"
  );
}

async function updateVerificationToken(userId, token) {
  const db = getPool();

  if (!db) {
    throw new Error("Banco de dados não configurado");
  }

  await db.query(
    `
      UPDATE app_users
      SET
        verification_token = $1,
        verification_expires_at = NOW() + interval '1 day'
      WHERE id = $2
    `,
    [token, userId]
  );
}

async function finishGoogleLogin(payload, res) {
  const googleId = String(payload?.sub || "").trim();
  const email = normalizeEmail(payload?.email);
  const name = normalizeName(payload?.name || "Google User");

  if (!googleId || !email) {
    return res.status(400).json({
      ok: false,
      error: "Dados do Google inválidos",
    });
  }

  let user = await findUserByGoogleId(googleId);

  if (!user) {
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      user = await linkGoogleToExistingUser({
        userId: existingUser.id,
        googleId,
      });
    } else {
      user = await createGoogleUser({
        googleId,
        email,
        name,
      });
    }
  }

  const token = signToken(user);

  return res.json({
    ok: true,
    token,
    user: sanitizeUser(user),
    message: "Login com Google realizado com sucesso.",
  });
}

/* =========================
   REGISTER
========================= */
export async function register(req, res) {
  try {
    const name = normalizeName(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "").trim();

    if (!name || !email || !password) {
      return res.status(400).json({
        ok: false,
        error: "Nome, email e senha são obrigatórios",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        error: "A senha precisa ter pelo menos 6 caracteres",
      });
    }

    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      return res.status(409).json({
        ok: false,
        error: "Este email já está cadastrado",
      });
    }

    const verificationToken = generateVerificationToken();
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const createdUser = await createPendingUser({
      name,
      email,
      password,
      verificationToken,
      verificationExpiresAt,
    });

    const emailResult = await sendVerificationEmail({
      to: email,
      name,
      token: verificationToken,
    });

    const smtpSkipped = Boolean(emailResult?.skipped);

    if (smtpSkipped) {
      logWarn("SMTP não configurado. Usuário criado sem envio de email.", email);

      await markUserEmailVerified(createdUser.id);

      const verifiedUser = await findUserProfileById(createdUser.id);
      const token = signToken(verifiedUser);

      return res.status(201).json({
        ok: true,
        token,
        user: sanitizeUser(verifiedUser),
        message: "Conta criada com sucesso.",
      });
    }

    return res.status(201).json({
      ok: true,
      user: sanitizeUser(createdUser),
      message: "Conta criada. Verifique seu email para entrar.",
    });
  } catch (error) {
    logError("Erro register", error);
    return res.status(500).json({
      ok: false,
      error: "Erro ao criar conta",
    });
  }
}

/* =========================
   LOGIN
========================= */
export async function login(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "").trim();

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        error: "Email e senha são obrigatórios",
      });
    }

    const user = await findUserAuthByEmail(email);

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "Email ou senha inválidos",
      });
    }

    const passwordOk = await comparePassword(password, user.password_hash);

    if (!passwordOk) {
      return res.status(401).json({
        ok: false,
        error: "Email ou senha inválidos",
      });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        ok: false,
        error: "Confirme seu email antes de entrar",
      });
    }

    const token = signToken(user);

    return res.json({
      ok: true,
      token,
      user: sanitizeUser(user),
      message: "Login realizado com sucesso.",
    });
  } catch (error) {
    logError("Erro login", error);
    return res.status(500).json({
      ok: false,
      error: "Erro no login",
    });
  }
}

/* =========================
   GOOGLE LOGIN
========================= */
export async function googleLogin(req, res) {
  try {
    if (!env.googleClientId) {
      return res.status(500).json({
        ok: false,
        error: "GOOGLE_CLIENT_ID não configurado",
      });
    }

    if (req.method === "GET" && req.query?.code) {
      const code = String(req.query.code || "").trim();

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          client_id: env.googleClientId,
          client_secret: env.googleClientSecret,
          redirect_uri: getCallbackUrl(),
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) {
        logError("Erro Google token", tokenData);

        return res.status(400).json({
          ok: false,
          error: "Falha ao obter token do Google",
        });
      }

      const userRes = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        }
      );

      const userData = await userRes.json();

      if (!userRes.ok) {
        logError("Erro Google userinfo", userData);

        return res.status(400).json({
          ok: false,
          error: "Falha ao obter dados do usuário Google",
        });
      }

      return await finishGoogleLogin(userData, res);
    }

    const credential = String(req.body?.credential || "").trim();

    if (!credential) {
      return res.status(400).json({
        ok: false,
        error: "Credential do Google ausente",
      });
    }

    if (!googleClient) {
      return res.status(500).json({
        ok: false,
        error: "Cliente Google não configurado",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: env.googleClientId,
    });

    const payload = ticket.getPayload();

    return await finishGoogleLogin(payload, res);
  } catch (error) {
    logError("Erro Google", error);

    return res.status(500).json({
      ok: false,
      error: "Erro no login com Google",
    });
  }
}

/* =========================
   VERIFY EMAIL
========================= */
export async function verifyEmail(req, res) {
  try {
    const token = String(req.body?.token || req.query?.token || "").trim();

    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "Token obrigatório",
      });
    }

    const user = await findUserByVerificationToken(token);

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "Token inválido ou expirado",
      });
    }

    if (user.verification_expires_at && new Date(user.verification_expires_at) < new Date()) {
      return res.status(400).json({
        ok: false,
        error: "Token expirado",
      });
    }

    await markUserEmailVerified(user.id);

    const verifiedUser = await findUserProfileById(user.id);

    return res.json({
      ok: true,
      message: "Email confirmado com sucesso",
      user: sanitizeUser(verifiedUser),
    });
  } catch (error) {
    logError("Erro verifyEmail", error);

    return res.status(500).json({
      ok: false,
      error: "Erro ao confirmar email",
    });
  }
}

/* =========================
   RESEND VERIFICATION
========================= */
export async function resendVerification(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: "Email obrigatório",
      });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "Usuário não encontrado",
      });
    }

    if (user.email_verified) {
      return res.json({
        ok: true,
        message: "Email já confirmado",
      });
    }

    const token = generateVerificationToken();

    await updateVerificationToken(user.id, token);

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

    return res.status(500).json({
      ok: false,
      error: "Erro ao reenviar verificação",
    });
  }
}

/* =========================
   FORGOT PASSWORD
========================= */
export async function forgotPassword(_req, res) {
  return res.status(501).json({
    ok: false,
    error: "Forgot password ainda não implementado",
  });
}

/* =========================
   RESET PASSWORD
========================= */
export async function resetPassword(_req, res) {
  return res.status(501).json({
    ok: false,
    error: "Reset password ainda não implementado",
  });
}

/* =========================
   MAGIC LINK
========================= */
export async function magicLinkLogin(_req, res) {
  return res.status(501).json({
    ok: false,
    error: "Magic link ainda não implementado",
  });
}

export async function magicLinkVerify(_req, res) {
  return res.status(501).json({
    ok: false,
    error: "Magic link verify ainda não implementado",
  });
}

/* =========================
   ME
========================= */
export async function me(req, res) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "Não autorizado",
      });
    }

    const decoded = verifyJwtToken(token);
    const userId = decoded?.sub || decoded?.id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: "Token inválido",
      });
    }

    const user = await findUserProfileById(userId);

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "Usuário não encontrado",
      });
    }

    return res.json({
      ok: true,
      user: sanitizeUser(user),
    });
  } catch (error) {
    logError("Erro me", error);

    return res.status(401).json({
      ok: false,
      error: "Token inválido ou expirado",
    });
  }
}

/* =========================
   ALIASES DE COMPATIBILIDADE
========================= */
export const registerUser = register;
export const loginUser = login;
export const getMe = me;