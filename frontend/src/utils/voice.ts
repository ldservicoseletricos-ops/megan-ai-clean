export function speak(text: string) {
  try {
    if (!text) return;

    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "pt-BR";

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
  } catch (err) {
    console.error("Erro ao falar:", err);
  }
}