import { findUserProfileById, verifyJwtToken } from "../services/auth.service.js";

export async function requireAuth(req, res, next) {
  try {
    const authHeader = String(req.headers.authorization || "");
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "Token ausente",
      });
    }

    const decoded = verifyJwtToken(token);
    const user = await findUserProfileById(decoded?.sub);

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "Usuário não encontrado",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error: "Token inválido",
    });
  }
}