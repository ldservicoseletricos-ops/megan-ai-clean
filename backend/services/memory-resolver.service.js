function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function safeMemories(memories = []) {
  return Array.isArray(memories) ? memories : [];
}

function extractMemoryValue(item) {
  return item?.memory_value || item?.value || item?.content || item?.text || null;
}

function extractMemoryKey(item) {
  return normalizeText(item?.memory_key || item?.key || item?.name || "");
}

function matchAliasInMessage(messageNormalized, aliases = []) {
  return aliases.find((alias) => messageNormalized.includes(alias)) || null;
}

export function findDestinationFromMemories(message = "", memories = []) {
  const normalizedMessage = normalizeText(message);
  const list = safeMemories(memories);

  const destinationGroups = [
    {
      canonical: "casa",
      aliases: ["casa", "minha casa", "pra casa", "para casa", "ate casa"],
      memoryKeys: ["casa", "endereco_casa", "endereco casa", "home", "casa_endereco"],
    },
    {
      canonical: "trabalho",
      aliases: ["trabalho", "pro trabalho", "para o trabalho", "ate o trabalho"],
      memoryKeys: ["trabalho", "endereco_trabalho", "endereco trabalho", "work"],
    },
    {
      canonical: "igreja",
      aliases: ["igreja", "pra igreja", "para a igreja", "ate a igreja"],
      memoryKeys: ["igreja", "endereco_igreja", "endereco igreja", "church"],
    },
    {
      canonical: "escola",
      aliases: ["escola", "pra escola", "para a escola", "ate a escola"],
      memoryKeys: ["escola", "endereco_escola", "endereco escola", "school"],
    },
  ];

  for (const group of destinationGroups) {
    const matchedAlias = matchAliasInMessage(normalizedMessage, group.aliases);
    if (!matchedAlias) continue;

    const matchedMemory = list.find((item) => {
      const key = extractMemoryKey(item);
      return group.memoryKeys.some((candidate) => key.includes(candidate));
    });

    if (matchedMemory) {
      const value = extractMemoryValue(matchedMemory);
      if (value) {
        return {
          alias: group.canonical,
          resolvedFromMemory: true,
          address: value,
          memoryKey: matchedMemory?.memory_key || matchedMemory?.key || group.canonical,
        };
      }
    }

    return {
      alias: group.canonical,
      resolvedFromMemory: false,
      address: group.canonical,
      memoryKey: null,
    };
  }

  return null;
}