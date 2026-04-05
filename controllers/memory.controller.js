import {
  getUserMemories,
  getMemoryTypeLabel,
  removeMemory,
  saveMemory,
} from "../services/memory.service.js";

function toOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

/**
 * Listar memórias do usuário
 */
export async function listMemories(req, res, next) {
  try {
    const data = await getUserMemories(req.user.id, { includeExpired: true });

    return res.json({
      ok: true,
      memories: data.memories,
      activeMemories: data.activeMemories,
      projectMemory: data.projectMemory,
      profileSummary: data.profileSummary,
      stats: data.stats,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Criar ou atualizar memória
 */
export async function createOrUpdateMemory(req, res, next) {
  try {
    const key = String(req.body?.key || "").trim();
    const value = String(req.body?.value || "").trim();
    const type = String(req.body?.type || req.body?.memoryType || "profile").trim();
    const priority = toOptionalNumber(req.body?.priority);
    const ttlDays = toOptionalNumber(req.body?.ttlDays);
    const expiresAt = String(req.body?.expiresAt || "").trim() || undefined;
    const source = String(req.body?.source || "manual").trim() || "manual";

    if (!key) {
      return res.status(400).json({
        ok: false,
        error: "Campo 'key' é obrigatório",
      });
    }

    if (!value) {
      return res.status(400).json({
        ok: false,
        error: "Campo 'value' é obrigatório",
      });
    }

    const memory = await saveMemory({
      userId: req.user.id,
      key,
      value,
      type,
      priority,
      ttlDays,
      expiresAt,
      source,
    });

    if (!memory) {
      return res.status(500).json({
        ok: false,
        error: "Não foi possível salvar a memória",
      });
    }

    const data = await getUserMemories(req.user.id, { includeExpired: true });

    return res.json({
      ok: true,
      memory,
      memoryLevel: 4,
      appliedRules: {
        priority: memory.priority,
        validity: memory.expires_at,
        typeLabel: getMemoryTypeLabel(type),
      },
      projectMemory: data.projectMemory,
      profileSummary: data.profileSummary,
      stats: data.stats,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Remover memória por chave
 */
export async function deleteMemoryByKey(req, res, next) {
  try {
    const key = String(req.params?.key || "").trim();

    if (!key) {
      return res.status(400).json({
        ok: false,
        error: "Chave não informada",
      });
    }

    const deleted = await removeMemory(req.user.id, key);
    const data = await getUserMemories(req.user.id, { includeExpired: true });

    return res.json({
      ok: true,
      deleted,
      projectMemory: data.projectMemory,
      profileSummary: data.profileSummary,
      stats: data.stats,
    });
  } catch (error) {
    next(error);
  }
}
