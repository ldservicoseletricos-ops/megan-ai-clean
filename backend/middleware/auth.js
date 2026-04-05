import { ensureUserByExternalId } from "../models/user.model.js";

export async function requireAuth(req, _res, next) {
  try {
    const externalId =
      req.headers["x-user-id"] ||
      req.body?.userId ||
      req.query?.userId ||
      "local-user";

    const name =
      req.headers["x-user-name"] ||
      req.body?.userName ||
      "Luiz";

    const email =
      req.headers["x-user-email"] ||
      req.body?.userEmail ||
      null;

    const user = await ensureUserByExternalId({
      externalId: String(externalId),
      name: String(name || "Usuário"),
      email: email ? String(email) : null,
    });

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}