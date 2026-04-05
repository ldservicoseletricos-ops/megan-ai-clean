function normalize(text = "") {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function cleanValue(value = "") {
  return String(value || "")
    .replace(/^[\s:,-]+/, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

function extractAfterKeyword(text, keywords = []) {
  for (const key of keywords) {
    const index = text.indexOf(key);
    if (index !== -1) {
      return cleanValue(text.substring(index + key.length));
    }
  }
  return null;
}

function buildMemory(
  key,
  value,
  memoryType = "profile",
  action = "upsert",
  options = {}
) {
  if (!key || (!value && action !== "delete")) return null;

  return {
    key,
    value: action === "delete" ? "" : cleanValue(value),
    memoryType,
    action,
    priority: options.priority,
    ttlDays: options.ttlDays,
    source: options.source || "auto",
  };
}

function detectLocationMemory(text) {
  const locationPatterns = [
    {
      triggers: ["minha casa", "mudei de casa", "novo endereco da minha casa", "novo endereço da minha casa"],
      key: "endereco_casa",
      options: { priority: 92, ttlDays: 365 },
    },
    {
      triggers: ["meu trabalho", "mudei de trabalho", "novo endereco do trabalho", "novo endereço do trabalho"],
      key: "endereco_trabalho",
      options: { priority: 90, ttlDays: 365 },
    },
    {
      triggers: ["minha igreja", "igreja"],
      key: "endereco_igreja",
      options: { priority: 82, ttlDays: 365 },
    },
    {
      triggers: ["minha escola", "escola"],
      key: "endereco_escola",
      options: { priority: 82, ttlDays: 365 },
    },
  ];

  for (const pattern of locationPatterns) {
    const hasTrigger = pattern.triggers.some((trigger) => text.includes(trigger));
    if (!hasTrigger) continue;

    const value = extractAfterKeyword(text, [
      "fica em",
      "fica na",
      "fica no",
      "e em",
      "e na",
      "e no",
      "é em",
      "é na",
      "é no",
      "agora e em",
      "agora e na",
      "agora e no",
      "agora é em",
      "agora é na",
      "agora é no",
    ]);

    if (value) {
      return buildMemory(pattern.key, value, "location", "replace", pattern.options);
    }
  }

  return null;
}

function detectPreferredNameMemory(text) {
  if (
    text.includes("me chame de") ||
    text.includes("quero ser chamado de") ||
    text.includes("meu nome preferido e") ||
    text.includes("meu nome preferido é")
  ) {
    const value = extractAfterKeyword(text, [
      "me chame de",
      "quero ser chamado de",
      "meu nome preferido e",
      "meu nome preferido é",
    ]);

    return buildMemory("nome_preferido", value, "profile", "replace", {
      priority: 100,
      source: "auto",
    });
  }

  return null;
}

function detectPreferenceMemory(text) {
  if (text.includes("eu prefiro")) {
    const value = extractAfterKeyword(text, ["eu prefiro"]);
    return buildMemory("preferencia_geral", value, "preference", "replace", {
      priority: 76,
      ttlDays: 180,
    });
  }

  if (text.includes("gosto de")) {
    const value = extractAfterKeyword(text, ["gosto de"]);
    return buildMemory("gosto_pessoal", value, "preference", "replace", {
      priority: 72,
      ttlDays: 180,
    });
  }

  if (text.includes("nao gosto mais de") || text.includes("não gosto mais de")) {
    const value = extractAfterKeyword(text, ["nao gosto mais de", "não gosto mais de"]);
    return buildMemory("nao_gosto", value, "preference", "replace", {
      priority: 74,
      ttlDays: 180,
    });
  }

  if (text.includes("nao gosto de") || text.includes("não gosto de")) {
    const value = extractAfterKeyword(text, ["nao gosto de", "não gosto de"]);
    return buildMemory("nao_gosto", value, "preference", "replace", {
      priority: 74,
      ttlDays: 180,
    });
  }

  return null;
}

function detectRoutineMemory(text) {
  const rules = [
    {
      triggers: ["eu acordo as", "acordo as"],
      key: "rotina_acordar",
      options: { priority: 68, ttlDays: 60 },
    },
    {
      triggers: ["eu durmo as", "durmo as"],
      key: "rotina_dormir",
      options: { priority: 68, ttlDays: 60 },
    },
    {
      triggers: ["vou para o trabalho as", "saio para o trabalho as"],
      key: "rotina_saida_trabalho",
      options: { priority: 70, ttlDays: 60 },
    },
    {
      triggers: ["eu trabalho de", "trabalho de"],
      key: "rotina_trabalho",
      options: { priority: 70, ttlDays: 60 },
    },
  ];

  for (const rule of rules) {
    for (const trigger of rule.triggers) {
      if (text.includes(trigger)) {
        const value = extractAfterKeyword(text, [trigger]);
        return buildMemory(rule.key, value, "routine", "replace", rule.options);
      }
    }
  }

  return null;
}

function detectObjectiveMemory(text) {
  const rules = [
    {
      triggers: ["meu objetivo e", "meu objetivo é"],
      key: "objective",
      memoryType: "goal",
      options: { priority: 88, ttlDays: 120 },
    },
    {
      triggers: ["meu foco agora e", "meu foco agora é", "meu foco e", "meu foco é"],
      key: "focus",
      memoryType: "goal",
      options: { priority: 84, ttlDays: 120 },
    },
    {
      triggers: ["quero conseguir", "quero alcancar", "quero alcançar"],
      key: "goal",
      memoryType: "goal",
      options: { priority: 82, ttlDays: 120 },
    },
    {
      triggers: ["estou trabalhando em"],
      key: "project",
      memoryType: "project",
      options: { priority: 86, ttlDays: 120 },
    },
    {
      triggers: ["meu projeto atual e", "meu projeto atual é"],
      key: "project",
      memoryType: "project",
      options: { priority: 90, ttlDays: 120 },
    },
  ];

  for (const rule of rules) {
    for (const trigger of rule.triggers) {
      if (text.includes(trigger)) {
        const value = extractAfterKeyword(text, [trigger]);
        return buildMemory(
          rule.key,
          value,
          rule.memoryType || "goal",
          "replace",
          rule.options
        );
      }
    }
  }

  return null;
}

function detectDeletionMemory(text) {
  const rules = [
    {
      triggers: ["esqueca meu trabalho", "esqueca do trabalho", "esqueça meu trabalho", "esqueça do trabalho"],
      key: "endereco_trabalho",
      memoryType: "location",
    },
    {
      triggers: ["esqueca minha casa", "esqueça minha casa"],
      key: "endereco_casa",
      memoryType: "location",
    },
    {
      triggers: ["esqueca minha igreja", "esqueça minha igreja"],
      key: "endereco_igreja",
      memoryType: "location",
    },
    {
      triggers: ["esqueca minha escola", "esqueça minha escola"],
      key: "endereco_escola",
      memoryType: "location",
    },
    {
      triggers: ["esqueca meu nome preferido", "esqueça meu nome preferido"],
      key: "nome_preferido",
      memoryType: "profile",
    },
    {
      triggers: ["esqueca minhas preferencias", "esqueça minhas preferências", "esqueça minhas preferencias"],
      key: "preferencia_geral",
      memoryType: "preference",
    },
  ];

  for (const rule of rules) {
    if (rule.triggers.some((trigger) => text.includes(trigger))) {
      return buildMemory(rule.key, "", rule.memoryType, "delete", {
        priority: 100,
      });
    }
  }

  return null;
}

function dedupeMemories(memories = []) {
  const map = new Map();

  for (const item of memories) {
    if (!item?.key) continue;
    map.set(item.key, item);
  }

  return Array.from(map.values());
}

export function detectAutoMemories(message = "") {
  const text = normalize(message);

  const found = [
    detectDeletionMemory(text),
    detectLocationMemory(text),
    detectPreferredNameMemory(text),
    detectPreferenceMemory(text),
    detectRoutineMemory(text),
    detectObjectiveMemory(text),
  ].filter(Boolean);

  return dedupeMemories(found);
}
