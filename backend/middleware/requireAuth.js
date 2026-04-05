import { verifyJwtToken } from "../services/auth.service.js";

function extractBearerToken(req) {
  const authHeader = String(req.headers.authorization || "").trim();

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token || null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "Token não fornecido",
      });
    }

    const decoded = verifyJwtToken(token);
    const userId = decoded?.sub || decoded?.id || null;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: "Token inválido",
      });
    }

    req.auth = decoded;
    req.user = {
      id: userId,
      email: decoded?.email || null,
      plan: decoded?.plan || "free",
      role: decoded?.role || "user",
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error: "Token inválido ou expirado",
    });
  }
}

export default requireAuth;