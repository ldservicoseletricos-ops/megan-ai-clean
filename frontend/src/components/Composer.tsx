import { useState, KeyboardEvent } from "react";

interface ComposerProps {
  onSend: (message: string) => Promise<void> | void;
  isLoading: boolean;
}

export default function Composer({ onSend, isLoading }: ComposerProps) {
  const [value, setValue] = useState("");

  async function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;

    setValue("");
    await onSend(trimmed);
  }

  async function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await handleSubmit();
    }
  }

  return (
    <div className="composer">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Digite sua mensagem para a Megan..."
        rows={1}
      />
      <button onClick={handleSubmit} disabled={isLoading}>
        {isLoading ? "Enviando..." : "Enviar"}
      </button>
    </div>
  );
}