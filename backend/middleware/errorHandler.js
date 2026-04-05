import { logError } from "../utils/logger.js";

export function notFoundHandler(_req, res) {
  res.status(404).json({
    ok: false,
    error: "Rota não encontrada",
  });
}

export function errorHandler(error, _req, res, _next) {
  logError("Erro no backend", error);

  res.status(500).json({
    ok: false,
    error: error.message || "Erro interno do servidor",
  });
}