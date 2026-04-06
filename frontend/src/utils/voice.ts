let lastSpokenText = "";
let lastSpokenAt = 0;
let lastQueueId = 0;

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function stopSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

export function speak(text: string, priority: "normal" | "high" = "normal") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (!text || !String(text).trim()) return;

  const now = Date.now();
  const normalized = normalizeText(text);

  const repeatedTooSoon =
    normalized === lastSpokenText &&
    now - lastSpokenAt < 9000;

  if (repeatedTooSoon) {
    return;
  }

  const queueId = ++lastQueueId;

  if (priority === "high") {
    window.speechSynthesis.cancel();
  } else {
    const speakingNow =
      window.speechSynthesis.speaking || window.speechSynthesis.pending;

    if (speakingNow) {
      return;
    }
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-BR";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  utterance.onstart = () => {
    if (queueId !== lastQueueId) {
      window.speechSynthesis.cancel();
      return;
    }

    lastSpokenText = normalized;
    lastSpokenAt = Date.now();
  };

  utterance.onerror = () => {
    // evita travar o fluxo em erro de voz
  };

  utterance.onend = () => {
    // nada
  };

  window.speechSynthesis.speak(utterance);
}