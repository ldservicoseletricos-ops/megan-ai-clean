export function detectIntent({ message = "", files = [], fileMode = null }) {
  const lower = String(message || "").toLowerCase().trim();

  const hasWeatherTerms =
    lower.includes("clima") ||
    lower.includes("temperatura") ||
    lower.includes("tempo") ||
    lower.includes("previsão") ||
    lower.includes("previsao") ||
    lower.includes("vai chover") ||
    lower.includes("chuva") ||
    lower.includes("frio") ||
    lower.includes("calor") ||
    lower.includes("sensação térmica") ||
    lower.includes("sensacao termica") ||
    lower.includes("umidade") ||
    lower.includes("vento");

  const hasCurrentWeatherTerms =
    lower.includes("agora") ||
    lower.includes("nesse momento") ||
    lower.includes("neste momento") ||
    lower.includes("aqui") ||
    lower.includes("hoje");

  const hasHourlyForecastTerms =
    lower.includes("próximas horas") ||
    lower.includes("proximas horas") ||
    lower.includes("daqui a pouco") ||
    lower.includes("mais tarde") ||
    lower.includes("nas próximas horas") ||
    lower.includes("nas proximas horas");

  const hasTransitTerms =
    lower.includes("trânsito") ||
    lower.includes("transito") ||
    lower.includes("rota") ||
    lower.includes("engarrafamento") ||
    lower.includes("melhor horário para sair") ||
    lower.includes("melhor horario para sair") ||
    lower.includes("quanto tempo leva") ||
    lower.includes("quanto tempo demora") ||
    lower.includes("tempo até") ||
    lower.includes("tempo ate") ||
    lower.includes("como chegar") ||
    lower.includes("ir para") ||
    lower.includes("ir até") ||
    lower.includes("ir ate") ||
    lower.includes("chegar em") ||
    lower.includes("chegar até") ||
    lower.includes("chegar ate") ||
    lower.includes("trajeto") ||
    lower.includes("destino");

  const hasRouteStyleTerms =
    lower.startsWith("rota ") ||
    lower.startsWith("rota para ") ||
    lower.startsWith("como chegar ") ||
    lower.includes(" até ") ||
    lower.includes(" ate ") ||
    lower.includes(" para ") ||
    lower.includes(" pro ") ||
    lower.includes(" pra ");

  if (fileMode === "vision_analysis") {
    return "vision_analysis";
  }

  if (fileMode === "document_analysis") {
    return "document_analysis";
  }

  if (fileMode === "text_analysis") {
    return "text_analysis";
  }

  if (hasTransitTerms || hasRouteStyleTerms) {
    return "transit";
  }

  if (hasWeatherTerms && hasHourlyForecastTerms) {
    return "weather";
  }

  if (hasWeatherTerms && hasCurrentWeatherTerms) {
    return "weather";
  }

  if (hasWeatherTerms) {
    return "weather";
  }

  if (files.length > 0) {
    return "file_analysis";
  }

  if (
    lower.includes("resumo") ||
    lower.includes("analise") ||
    lower.includes("análise") ||
    lower.includes("explique") ||
    lower.includes("interprete") ||
    lower.includes("compare") ||
    lower.includes("o que significa")
  ) {
    return "analysis";
  }

  if (
    lower.includes("memória") ||
    lower.includes("memoria") ||
    lower.includes("lembrar") ||
    lower.includes("salvar") ||
    lower.includes("guarde isso") ||
    lower.includes("anota isso")
  ) {
    return "memory";
  }

  return "general";
}

export function buildSystemStyle() {
  return [
    "Você é Megan, uma assistente operacional avançada.",
    "Responda de forma clara, útil, prática e organizada.",
    "Evite enrolação.",
    "Quando possível, entregue soluções aplicáveis.",
    "Se houver arquivos, use os previews e o texto extraído.",
    "Se houver imagem e visão multimodal disponível, descreva e analise a imagem com objetividade.",
    "Se o usuário enviar PDF, DOCX ou texto, priorize resumo, pontos-chave, problemas detectados e próximos passos.",
    "Se a pergunta for sobre clima, responda com base nos dados meteorológicos disponíveis no sistema.",
    "Para clima, priorize: condição atual, temperatura, sensação térmica, chuva hoje e próximas horas quando esses dados existirem.",
    "Se a pergunta for sobre trânsito, rota ou deslocamento, responda com base nos dados de trânsito e tempo de trajeto disponíveis no sistema.",
    "Quando houver recomendação de melhor horário para sair, destaque isso de forma objetiva.",
  ].join(" ");
}