import { detectIntent, buildSystemStyle } from "../services/reasoning.service.js";

export function decideBrainMode({ message, files }) {
  const intent = detectIntent({ message, files });

  return {
    intent,
    systemStyle: buildSystemStyle(),
  };
}