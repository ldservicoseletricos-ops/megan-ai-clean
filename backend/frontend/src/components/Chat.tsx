import React, { useEffect, useRef, useState } from "react";
import {
  ChatMessage,
  ChatSession,
  getSessionMessages,
  getSessions,
  renameSession,
  streamMessage,
} from "../services/chat";

type ChatProps = {
  user: any;
  onLogout: () => void;
};

function Chat({ user, onLogout }: ChatProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Olá, ${user?.name || user?.email || "Luiz"}! A Megan OS está online.`,
    },
  ]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string>("");
  const [renameValue, setRenameValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const token = localStorage.getItem("megan_token") || "";

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function loadSessions(selectSessionId?: string) {
    try {
      setLoadingSessions(true);
      setError("");

      const data = await getSessions(token);
      setSessions(data);

      const nextId = selectSessionId || activeSessionId || data[0]?.id || "";

      if (nextId) {
        setActiveSessionId(nextId);
        await loadMessages(nextId);
      }
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar sessões");
    } finally {
      setLoadingSessions(false);
    }
  }

  async function loadMessages(sessionId: string) {
    try {
      setError("");
      const data = await getSessionMessages(sessionId, token);

      if (data.length > 0) {
        setMessages(data);
      } else {
        setMessages([
          {
            id: "empty-session",
            role: "assistant",
            content: "Conversa carregada. Pode mandar sua próxima mensagem.",
          },
        ]);
      }
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar mensagens");
    }
  }

  async function handleSendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };

    const assistantId = `assistant-${Date.now() + 1}`;

    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        content: "",
      },
    ]);

    setInput("");
    setLoading(true);
    setError("");

    try {
      let finalSessionId = activeSessionId;

      await streamMessage(
        text,
        token,
        {
          onToken: (tokenChunk) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: `${msg.content}${tokenChunk}` }
                  : msg
              )
            );
          },
          onDone: async (payload) => {
            const finalText =
              payload?.message?.content ||
              payload?.reply ||
              payload?.message ||
              "";

            if (finalText) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: finalText }
                    : msg
                )
              );
            }

            if (payload?.sessionId) {
              finalSessionId = payload.sessionId;
              setActiveSessionId(payload.sessionId);
              await loadSessions(payload.sessionId);
            }
          },
          onError: (message) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: message || "Erro no stream da Megan OS" }
                  : msg
              )
            );
          },
        },
        activeSessionId || undefined
      );

      if (finalSessionId && finalSessionId !== activeSessionId) {
        setActiveSessionId(finalSessionId);
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: err?.message || "Erro ao conectar com Megan OS",
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  }

  function handleNewConversation() {
    setActiveSessionId("");
    setMessages([
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "Nova conversa iniciada com sucesso.",
      },
    ]);
    setInput("");
    setError("");
    setRenamingSessionId("");
    setRenameValue("");
  }

  async function handleSelectSession(sessionId: string) {
    setActiveSessionId(sessionId);
    setRenamingSessionId("");
    setRenameValue("");
    await loadMessages(sessionId);
  }

  function startRename(session: ChatSession) {
    setRenamingSessionId(session.id);
    setRenameValue(session.title || "");
  }

  async function handleSaveRename(sessionId: string) {
    try {
      setError("");
      const updated = await renameSession(sessionId, renameValue.trim(), token);

      setSessions((prev) =>
        prev.map((item) => (item.id === sessionId ? updated : item))
      );

      setRenamingSessionId("");
      setRenameValue("");
    } catch (err: any) {
      setError(err?.message || "Erro ao renomear sessão");
    }
  }

  function handleCancelRename() {
    setRenamingSessionId("");
    setRenameValue("");
  }

  return (
    <div className="chat-shell">
      <aside className="chat-sidebar">
        <div className="chat-brand">
          <div className="chat-brand-badge">M</div>
          <div>
            <h2>Megan OS</h2>
            <p>Histórico real</p>
          </div>
        </div>

        <button
          type="button"
          className="sidebar-btn"
          onClick={handleNewConversation}
        >
          + Nova conversa
        </button>

        <div className="sessions-list">
          {loadingSessions ? (
            <div className="sidebar-empty">Carregando conversas...</div>
          ) : sessions.length === 0 ? (
            <div className="sidebar-empty">Nenhuma conversa ainda.</div>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isRenaming = session.id === renamingSessionId;

              return (
                <div
                  key={session.id}
                  className={`session-item ${isActive ? "active" : ""}`}
                >
                  {isRenaming ? (
                    <div className="rename-box">
                      <input
                        className="rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        placeholder="Novo nome"
                      />
                      <div className="rename-actions">
                        <button
                          type="button"
                          className="mini-btn primary"
                          onClick={() => handleSaveRename(session.id)}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={handleCancelRename}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="session-main"
                        onClick={() => handleSelectSession(session.id)}
                      >
                        {session.title || "Nova conversa"}
                      </button>

                      <button
                        type="button"
                        className="session-edit"
                        onClick={() => startRename(session)}
                        title="Renomear"
                      >
                        ✎
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="sidebar-user">
          <div className="sidebar-user-name">
            {user?.name || "Usuário"}
          </div>
          <div className="sidebar-user-email">
            {user?.email || ""}
          </div>

          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={onLogout}
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="chat-main">
        <header className="chat-header">
          <h1>Megan OS</h1>
          <p>Resposta em tempo real com sessões persistidas</p>
        </header>

        <section className="chat-messages">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message-row ${
                message.role === "user" ? "user" : "assistant"
              }`}
            >
              <div className="message-bubble">
                {message.content || (message.role === "assistant" ? "..." : "")}
              </div>
            </div>
          ))}

          {loading ? (
            <div className="typing-indicator">Megan está digitando...</div>
          ) : null}

          {error ? <div className="chat-error">{error}</div> : null}

          <div ref={messagesEndRef} />
        </section>

        <footer className="chat-composer">
          <div className="composer-box">
            <textarea
              placeholder="Digite sua mensagem para a Megan..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />

            <button
              type="button"
              className="send-btn"
              onClick={handleSendMessage}
              disabled={loading}
            >
              {loading ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default Chat;