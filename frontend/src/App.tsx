import { useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar";
import MessageBubble from "./components/MessageBubble";
import Composer from "./components/Composer";
import { checkHealth, sendChatMessage } from "./services/api";
import type { ChatMessage } from "./types/chat";

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState("Verificando backend...");

  useEffect(() => {
    async function loadHealth() {
      try {
        const health = await checkHealth();
        if (health?.ok) {
          setBackendStatus("Backend online");
        } else {
          setBackendStatus("Backend respondeu com alerta");
        }
      } catch {
        setBackendStatus("Falha ao conectar com backend");
      }
    }

    loadHealth();
  }, []);

  const emptyState = useMemo(() => messages.length === 0, [messages.length]);

  function handleNewChat() {
    setMessages([]);
  }

  async function handleSend(message: string) {
    const userMessage = createMessage("user", message);
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const result = await sendChatMessage(message);

      const assistantText =
        result.reply ||
        result.response ||
        result.message ||
        "Recebi sua mensagem, mas não veio resposta do backend.";

      const assistantMessage = createMessage("assistant", assistantText);
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const assistantMessage = createMessage(
        "assistant",
        "Erro ao conectar com o backend da Megan OS."
      );
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="layout">
      <Sidebar onNewChat={handleNewChat} />

      <main className="main">
        <header className="topbar">
          <div>
            <h2>Megan OS</h2>
            <p>{backendStatus}</p>
          </div>
        </header>

        <section className="chat-area">
          {emptyState ? (
            <div className="empty-state">
              <h3>Bem-vindo à Megan OS</h3>
              <p>Seu backend já está online. Agora você pode testar o chat.</p>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}
        </section>

        <Composer onSend={handleSend} isLoading={isLoading} />
      </main>
    </div>
  );
}