import { buildContext } from "./context.core.js";
import { decideBrainMode } from "./brain.core.js";
import {
  summarizeUploadedFiles,
  readTextFileSafe,
  getWeatherSnapshot,
  classifyFileSet,
  getPrimaryImageForMultimodal,
  getTransitInfo,
} from "../services/tool.service.js";
import { generateAiResponse } from "../services/ai.service.js";
import { sanitizeAssistantOutput } from "../services/safety.service.js";
import { findDestinationFromMemories } from "../services/memory-resolver.service.js";
import { detectAutoMemories } from "../services/memory-auto.service.js";
import { saveManyMemories } from "../services/memory.service.js";

function buildFileContextBlock(summarizedFiles = []) {
  if (!summarizedFiles.length) return null;

  return {
    role: "system",
    content: `Arquivos enviados: ${summarizedFiles
      .map((file) => {
        const preview =
          file.previewText &&
          (file.previewStatus === "ok" || file.previewStatus === "metadata_only")
            ? ` preview: ${file.previewText}`
            : ` status: ${file.previewStatus}`;

        return `[nome: ${file.originalName || file.originalname || "arquivo"}; tipo: ${
          file.mimeType || "desconhecido"
        }; categoria: ${file.kind || "file"}; tamanho: ${
          file.sizeLabel || "desconhecido"
        };${preview}]`;
      })
      .join(" ")}`,
  };
}

function buildWeatherContextBlock(weather) {
  if (!weather) return null;

  const nextHoursText = Array.isArray(weather.nextHours)
    ? weather.nextHours
        .slice(0, 8)
        .map((hour) => {
          const label = hour?.label || hour?.time || "--:--";
          const temp =
            hour?.temperature === null || hour?.temperature === undefined
              ? "--"
              : `${Math.round(hour.temperature)}°C`;
          const rain =
            hour?.precipitationProbability === null ||
            hour?.precipitationProbability === undefined
              ? "--"
              : `${Math.round(hour.precipitationProbability)}%`;

          return `${label}: ${temp}, chuva ${rain}, condição ${hour?.condition || "indefinida"}`;
        })
        .join(" | ")
    : "";

  return {
    role: "system",
    content: [
      `Dados de clima atual: local ${weather.location || "desconhecido"}, condição ${
        weather.condition || "indefinida"
      }, temperatura ${
        weather.temperature === null || weather.temperature === undefined
          ? "--"
          : `${Math.round(weather.temperature)}°C`
      }.`,
      weather.summary ? `Resumo: ${weather.summary}.` : "",
      nextHoursText ? `Próximas horas: ${nextHoursText}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function buildTransitContextBlock(transit) {
  if (!transit) return null;

  const current = transit.current?.ok
    ? `Trajeto atual: duração ${transit.current.durationLabel || "--"}, distância ${
        transit.current.distanceLabel || "--"
      }.`
    : "Trajeto atual indisponível.";

  const bestOptions =
    Array.isArray(transit.bestDepartureOptions) && transit.bestDepartureOptions.length
      ? `Melhores saídas: ${transit.bestDepartureOptions
          .map((item) => {
            if (!item?.ok) return `${item?.departureLabel || "horário"} sem rota`;
            return `${item.departureLabel}: ${item.durationLabel}`;
          })
          .join(" | ")}.`
      : "";

  return {
    role: "system",
    content: [
      `Dados de trânsito: origem ${transit.origin || "desconhecida"}, destino ${
        transit.destination || "desconhecido"
      }.`,
      current,
      bestOptions,
      transit.recommendation ? `Recomendação: ${transit.recommendation}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function buildMemoryContextBlock(context) {
  const activeMemories = Array.isArray(context?.activeMemories)
    ? context.activeMemories.slice(0, 20)
    : [];

  if (!activeMemories.length && !context?.profileSummary) {
    return null;
  }

  const lines = [];

  if (context?.profileSummary) {
    lines.push(`Resumo automático do perfil: ${context.profileSummary}`);
  }

  if (activeMemories.length) {
    lines.push(
      `Memórias priorizadas: ${activeMemories
        .map(
          (item) =>
            `${item.memory_key}: ${item.memory_value} (tipo: ${item.memory_type}, prioridade: ${item.priority})`
        )
        .join(" | ")}`
    );
  }

  return {
    role: "system",
    content: lines.join(" "),
  };
}

function buildUserMessageContent({
  message,
  imageForVision,
  fileMode,
  weather,
  transit,
}) {
  const text = String(message || "").trim() || "Analise os arquivos enviados.";

  const climateHint = weather
    ? "\n\nSe a pergunta for sobre clima, use os dados meteorológicos do sistema."
    : "";

  const transitHint = transit
    ? "\n\nSe a pergunta for sobre rota, trânsito ou melhor horário para sair, use os dados de trânsito do sistema."
    : "";

  if (!imageForVision) {
    return {
      role: "user",
      content: `${text}${climateHint}${transitHint}`,
    };
  }

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: `${text}\n\nUse a imagem enviada como contexto visual complementar.${climateHint}${transitHint}`,
      },
      {
        type: "image_url",
        image_url: {
          url: imageForVision.dataUrl,
        },
      },
    ],
  };
}

function cleanExtractedDestination(text = "") {
  return String(text || "")
    .replace(/^(ate|para|pro|pra)\s+/i, "")
    .replace(/[?.!]+$/g, "")
    .trim();
}

function extractDestinationFromMessage(message = "") {
  const text = String(message || "").trim();

  const patterns = [
    /(?:quanto tempo(?: leva| demora)?(?: para ir)?(?: ate| para)?\s+)(.+)$/i,
    /(?:melhor horario).*(?:para|pra|pro|ate)\s+(.+)$/i,
    /(?:rota(?: para)?|como chegar(?: ate)?|ir para|ir ate|chegar em|chegar ate)\s+(.+)$/i,
    /(?:ate|para|pro|pra)\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const destination = cleanExtractedDestination(match[1]);
      if (destination) return destination;
    }
  }

  return null;
}

export async function preparePipeline({
  user,
  session,
  message,
  files = [],
  deviceLocation = {},
}) {
  const context = await buildContext({
    userId: user.id,
    sessionId: session?.id,
  });

  const summarizedFiles = await summarizeUploadedFiles(files);
  const fileMode = classifyFileSet(summarizedFiles);
  const brain = decideBrainMode({ message, files, fileMode });

  let extractedText = "";
  if (files[0]?.path) {
    const maybeText = await readTextFileSafe(files[0].path);
    if (maybeText) {
      extractedText = maybeText;
    }
  }

  const imageForVision = await getPrimaryImageForMultimodal(files);

  let weather = null;
  if (brain.intent === "weather") {
    weather = await getWeatherSnapshot(deviceLocation);
  }

  let transit = null;
  if (brain.intent === "transit") {
    const extractedDestination = extractDestinationFromMessage(message);
    const memoryDestination = findDestinationFromMemories(message, context.activeMemories);

    const resolvedDestination = extractedDestination || memoryDestination?.address || null;

    const transitResult = await getTransitInfo({
      origin: deviceLocation?.formatted || deviceLocation?.label || null,
      destination: resolvedDestination,
      originLat: deviceLocation?.lat,
      originLon: deviceLocation?.lon,
      travelMode: "DRIVE",
    });

    transit = {
      ...transitResult,
      resolvedByMemory: Boolean(!extractedDestination && memoryDestination?.resolvedFromMemory),
      destinationAlias: memoryDestination?.alias || null,
      destinationMemoryKey: memoryDestination?.memoryKey || null,
    };
  }

  const systemMessage = {
    role: "system",
    content: [
      brain.systemStyle,
      `Projeto atual: ${context.projectMemory.project || "nao definido"}.`,
      `Objetivo atual: ${context.projectMemory.objective || "nao definido"}.`,
      `Modo de arquivo detectado: ${fileMode}.`,
      "Quando houver arquivos, use previews, texto extraido e contexto visual quando disponivel.",
      "Quando houver clima ou transito, priorize os dados do sistema.",
      "Use primeiro as memórias de maior prioridade e ignore memórias expiradas.",
      extractedText ? `Texto extraido do arquivo principal: ${extractedText}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };

  const memoryBlock = buildMemoryContextBlock(context);
  const fileBlock = buildFileContextBlock(summarizedFiles);
  const weatherBlock = buildWeatherContextBlock(weather);
  const transitBlock = buildTransitContextBlock(transit);

  const historyMessages = context.history.map((item) => ({
    role: item.role,
    content: item.content,
  }));

  const userMessage = buildUserMessageContent({
    message,
    imageForVision,
    fileMode,
    weather,
    transit,
  });

  const messages = [
    systemMessage,
    ...(memoryBlock ? [memoryBlock] : []),
    ...(fileBlock ? [fileBlock] : []),
    ...(weatherBlock ? [weatherBlock] : []),
    ...(transitBlock ? [transitBlock] : []),
    ...historyMessages,
    userMessage,
  ];

  return {
    messages,
    intent: brain.intent,
    projectMemory: context.projectMemory,
    profileSummary: context.profileSummary,
    files: summarizedFiles,
    weather,
    transit,
    fileMode,
    imageForVision: imageForVision
      ? {
          originalName: imageForVision.originalName,
          mimeType: imageForVision.mimeType,
        }
      : null,
  };
}

export async function runPipeline(input) {
  const prepared = await preparePipeline(input);
  const aiText = await generateAiResponse(prepared.messages);
  const cleanAnswer = sanitizeAssistantOutput(aiText);

  try {
    const autoMemories = detectAutoMemories(input.message);

    if (autoMemories.length > 0 && input.user?.id) {
      await saveManyMemories(input.user.id, autoMemories);
      console.log("Memorias salvas automaticamente:", autoMemories);
    }
  } catch (error) {
    console.error("Erro ao salvar memorias automaticas:", error.message);
  }

  return {
    answer: cleanAnswer,
    intent: prepared.intent,
    projectMemory: prepared.projectMemory,
    profileSummary: prepared.profileSummary,
    files: prepared.files,
    weather: prepared.weather,
    transit: prepared.transit,
    messages: prepared.messages,
    fileMode: prepared.fileMode,
    imageForVision: prepared.imageForVision,
  };
}
