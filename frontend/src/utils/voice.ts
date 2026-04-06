let lastSpoken = "";
let lastTime = 0;
let cachedVoice: SpeechSynthesisVoice | null = null;

function pickBestVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();

  if (!voices.length) return null;

  return (
    voices.find((v) => v.lang === "pt-BR" && /google|natural|neural|microsoft/i.test(v.name)) ||
    voices.find((v) => v.lang === "pt-BR") ||
    voices.find((v) => v.lang.startsWith("pt")) ||
    voices[0] ||
    null
  );
}

function ensureVoiceLoaded() {
  if (!cachedVoice) {
    cachedVoice = pickBestVoice();
  }
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = pickBestVoice();
  };
}

export function speak(text: string) {
  try {
    if (!text) return;
    if (!("speechSynthesis" in window)) return;

    const normalized = String(text).trim();
    if (!normalized) return;

    const now = Date.now();

    // evita repetir a mesma fala em sequência
    if (normalized === lastSpoken && now - lastTime < 6000) {
      return;
    }

    lastSpoken = normalized;
    lastTime = now;

    ensureVoiceLoaded();

    const speech = new SpeechSynthesisUtterance(normalized);
    speech.lang = "pt-BR";
    speech.rate = 0.92;
    speech.pitch = 1;
    speech.volume = 1;

    if (cachedVoice) {
      speech.voice = cachedVoice;
      speech.lang = cachedVoice.lang || "pt-BR";
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
  } catch (err) {
    console.error("Erro ao falar:", err);
  }
}