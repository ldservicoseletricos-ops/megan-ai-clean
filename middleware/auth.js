import { verifyJwtToken } from "../services/auth.service.js";

function extractBearerToken(req) {
  const authHeader = String(req.headers.authorization || "").trim();

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token || null;
}

export async function authMiddleware(req, res, next) {
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
  } catch (_error) {
    return res.status(401).json({
      ok: false,
      error: "Token inválido ou expirado",
    });
  }
}

export function requirePlan(plans = []) {
  return function planMiddleware(req, res, next) {
    const userPlan = req.user?.plan || "free";

    if (!plans.includes(userPlan)) {
      return res.status(403).json({
        ok: false,
        error: "Seu plano não permite acessar este recurso",
      });
    }

    return next();
  };
}

export function requireRole(roles = []) {
  return function roleMiddleware(req, res, next) {
    const userRole = req.user?.role || "user";

    if (!roles.includes(userRole)) {
      return res.status(403).json({
        ok: false,
        error: "Você não tem permissão para acessar este recurso",
      });
    }

    return next();
  };
}

export default authMiddleware;