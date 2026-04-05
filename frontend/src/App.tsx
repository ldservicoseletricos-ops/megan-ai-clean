import { useEffect, useState } from "react";
import { checkHealth, sendChatMessage } from "./services/api";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function App() {
  const [status, setStatus] = useState("Verificando...");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadHealth() {
      try {
        const result = await checkHealth();
        if (result?.ok) {
          setStatus("Backend online");
        } else {
          setStatus("Backend respondeu com alerta");
        }
      } catch {
        setStatus("Erro ao conectar com backend");
      }
    }

    loadHealth();
  }, []);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = {
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const result = await sendChatMessage(trimmed);

      const assistantReply =
        result?.reply ||
        result?.response ||
        result?.message ||
        "Recebi sua mensagem, mas não veio resposta do backend.";

      const assistantMessage: Message = {
        role: "assistant",
        content: assistantReply,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      const assistantMessage: Message = {
        role: "assistant",
        content: "Erro ao conectar com o backend da Megan OS.",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0b1020", color: "#fff" }}>
      <aside
        style={{
          width: 280,
          background: "#111827",
          padding: 20,
          borderRight: "1px solid #1f2937",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Megan OS</h2>
        <p style={{ color: "#94a3b8" }}>{status}</p>
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            padding: 20,
            borderBottom: "1px solid #1f2937",
          }}
        >
          <h1 style={{ margin: 0 }}>Megan OS</h1>
          <p style={{ margin: "8px 0 0", color: "#94a3b8" }}>
            Resposta em tempo real com sessões persistidas
          </p>
        </header>

        <section
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 20,
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                maxWidth: 700,
                margin: "80px auto 0",
                textAlign: "center",
                color: "#cbd5e1",
              }}
            >
              <h3>Bem-vindo à Megan OS</h3>
              <p>Seu backend já está online. Agora você pode testar o chat.</p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  justifyContent: message.role === "user" ? "flex-end" : "flex-start",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "14px 16px",
                    borderRadius: 16,
                    background: message.role === "user" ? "#14b8a6" : "#1f2937",
                    color: "#fff",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {message.content}
                </div>
              </div>
            ))
          )}
        </section>

        <div
          style={{
            display: "flex",
            gap: 12,
            padding: 20,
            borderTop: "1px solid #1f2937",
            background: "#0f172a",
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua mensagem para a Megan..."
            style={{
              flex: 1,
              padding: 14,
              borderRadius: 12,
              border: "1px solid #334155",
              outline: "none",
              fontSize: 15,
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading}
            style={{
              minWidth: 120,
              border: 0,
              borderRadius: 12,
              background: "#14b8a6",
              color: "#fff",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </main>
    </div>
  );
}