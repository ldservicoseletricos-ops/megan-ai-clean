import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChatMemoryPayload,
  ChatMessage,
  MeganMode,
  ProjectMemoryPayload,
  Session,
  SessionListResponse,
  SessionMessagesResponse,
  StreamDonePayload,
  UploadedFile,
  User,
  apiRequest,
  buildAssetUrl,
  clearStoredSession,
  getStoredMode,
  setStoredMode,
  streamChatRequest,
} from "../services/api";
import MessageContent from "./MessageContent";
import ConversationDetails from "./ConversationDetails";
import AdminPanel from "./AdminPanel";

type ChatProps = {
  user: User;
  onLogout: () => void;
};

type PendingPreview = {
  file: File;
  previewUrl: string | null;
  isImage: boolean;
};

function makeTempId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatSessionTitle(title?: string) {
  const text = String(title || "").trim();
  return text || "Nova conversa";
}

function formatFileSize(size?: number) {
  const bytes = Number(size || 0);

  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractMessageFiles(message: ChatMessage): UploadedFile[] {
  const files = message?.metadata?.files;
  return Array.isArray(files) ? files : [];
}

function isImageMime(mime?: string) {
  return String(mime || "").toLowerCase().startsWith("image/");
}

function buildPendingPreview(file: File): PendingPreview {
  const image = isImageMime(file.type);
  return {
    file,
    previewUrl: image ? URL.createObjectURL(file) : null,
    isImage: image,
  };
}

function collectConversationFiles(messages: ChatMessage[]) {
  const map = new Map<string, UploadedFile>();

  for (const message of messages) {
    const files = extractMessageFiles(message);

    for (const file of files) {
      const key = String(
        file.id ||
          file.url ||
          `${file.original_name || file.name}-${file.created_at || ""}`
      );

      if (!map.has(key)) {
        map.set(key, file);
      }
    }
  }

  return Array.from(map.values());
}

function getModeLabel(mode: MeganMode) {
  if (mode === "livro") return "Livro";
  if (mode === "negocios") return "Negócios";
  if (mode === "automacao") return "Automação";
  return "Geral";
}

function Chat({ user, onLogout }: ChatProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingPreview[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [error, setError] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string>("");
  const [renameValue, setRenameValue] = useState("");
  const [chatMemory, setChatMemory] = useState<ChatMemoryPayload | null>(null);
  const [projectMemory, setProjectMemory] =
    useState<ProjectMemoryPayload | null>(null);
  const [mode, setMode] = useState<MeganMode>(getStoredMode());
  const [sessionSearch, setSessionSearch] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  const filteredSessions = useMemo(() => {
    const search = sessionSearch.trim().toLowerCase();

    if (!search) return sessions;

    return sessions.filter((session) =>
      String(session.title || "").toLowerCase().includes(search)
    );
  }, [sessions, sessionSearch]);

  const conversationFiles = useMemo(
    () => collectConversationFiles(messages),
    [messages]
  );

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages, streamingText, sending]);

  useEffect(() => {
    return () => {
      pendingFiles.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [pendingFiles]);

  useEffect(() => {
    setStoredMode(mode);
  }, [mode]);

  async function loadSessions(selectId?: string) {
    try {
      setLoadingSessions(true);
      setError("");

      const data = await apiRequest<SessionListResponse>("/api/chat/sessions", {
        method: "GET",
      });

      const sessionList = Array.isArray(data.sessions) ? data.sessions : [];
      setSessions(sessionList);

      const nextActiveId = selectId || activeSessionId || sessionList[0]?.id || "";

      if (nextActiveId) {
        setActiveSessionId(nextActiveId);
        await loadMessages(nextActiveId);
      } else {
        setMessages([
          {
            id: "welcome-empty",
            role: "assistant",
            content:
              "Olá! Sua Megan OS já está pronta.\n\nClique em **Nova conversa** e envie sua primeira mensagem.",
          },
        ]);
      }
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar conversas.");
    } finally {
      setLoadingSessions(false);
    }
  }

  async function loadMessages(sessionId: string) {
    try {
      if (!sessionId) return;

      setLoadingMessages(true);
      setError("");
      setStreamingText("");

      const data = await apiRequest<SessionMessagesResponse>(
        `/api/chat/sessions/${sessionId}/messages`,
        {
          method: "GET",
        }
      );

      setMessages(
        Array.isArray(data.messages) && data.messages.length > 0
          ? data.messages
          : [
              {
                id: "welcome-empty-session",
                role: "assistant",
                content:
                  "Conversa carregada.\n\nPode mandar sua próxima mensagem.",
              },
            ]
      );
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar mensagens.");
    } finally {
      setLoadingMessages(false);
    }
  }

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    });
  }

  function resetPendingFiles() {
    pendingFiles.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setPendingFiles([]);
  }

  function resetConversationInsights() {
    setChatMemory(null);
    setProjectMemory(null);
  }

  function handleNewChat() {
    setActiveSessionId("");
    setMessages([
      {
        id: "welcome-new",
        role: "assistant",
        content:
          `Nova conversa iniciada no modo **${getModeLabel(mode)}**.\n\nEscreva sua mensagem para a Megan OS.`,
      },
    ]);
    setInput("");
    resetPendingFiles();
    resetConversationInsights();
    setError("");
    setStreamingText("");
    setRenamingSessionId("");
    setRenameValue("");
  }

  async function handleSelectSession(sessionId: string) {
    setActiveSessionId(sessionId);
    setRenamingSessionId("");
    setRenameValue("");
    resetPendingFiles();
    await loadMessages(sessionId);
  }

  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);

    if (!files.length) return;

    const previews = files.map(buildPendingPreview);
    setPendingFiles((prev) => [...prev, ...previews]);
    event.target.value = "";
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => {
      const current = prev[index];
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSendMessage() {
    const text = input.trim();

    if ((!text && pendingFiles.length === 0) || sending) return;

    const filesToSend = pendingFiles.map((item) => item.file);

    const tempUserMessage: ChatMessage = {
      id: makeTempId("user"),
      role: "user",
      content: text || "(Arquivos enviados)",
      metadata: {
        localFiles: filesToSend.map((file) => ({
          original_name: file.name,
          size_bytes: file.size,
          mime_type: file.type,
        })),
        mode,
      },
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMessage]);
    setInput("");
    setSending(true);
    setError("");
    setStreamingText("");
    resetPendingFiles();

    try {
      let finalPayload: StreamDonePayload | null = null;
      let streamBuffer = "";

      await streamChatRequest({
        message: text || "(Arquivos enviados sem texto adicional)",
        sessionId: activeSessionId || undefined,
        files: filesToSend,
        mode,
        onMeta(meta) {
          if (meta?.sessionId) {
            setActiveSessionId(meta.sessionId);
          }
        },
        onToken(token) {
          streamBuffer += token;
          setStreamingText(streamBuffer);
        },
        onDone(payload) {
          finalPayload = payload;
        },
      });

      if (!finalPayload) {
        throw new Error("Stream finalizado sem payload.");
      }

      setMessages((prev) => {
        const withoutTemp = prev.filter((item) => item.id !== tempUserMessage.id);

        const savedUserMessage =
          finalPayload?.savedUserMessage || tempUserMessage;

        const assistantMessage = finalPayload?.message || {
          id: makeTempId("assistant"),
          role: "assistant" as const,
          content: streamBuffer || "Resposta recebida.",
        };

        return [...withoutTemp, savedUserMessage, assistantMessage];
      });

      setChatMemory(finalPayload.memory || null);
      setProjectMemory(finalPayload.projectMemory || null);

      if (finalPayload.mode) {
        setMode(finalPayload.mode);
      }

      setStreamingText("");

      if (finalPayload.sessionId) {
        setActiveSessionId(finalPayload.sessionId);
      }

      await loadSessions(finalPayload.sessionId || activeSessionId);
    } catch (err: any) {
      setMessages((prev) =>
        prev.filter((item) => item.id !== tempUserMessage.id)
      );

      setPendingFiles(filesToSend.map(buildPendingPreview));
      setStreamingText("");
      setError(err?.message || "Erro ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  }

  function handleComposerKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  }

  function handleLogoutClick() {
    clearStoredSession();
    onLogout();
  }

  function startRename(session: Session) {
    setRenamingSessionId(session.id);
    setRenameValue(session.title || "");
  }

  async function saveRename(sessionId: string) {
    const title = formatSessionTitle(renameValue);

    try {
      setError("");

      const response = await apiRequest<{ ok: boolean; session: Session }>(
        `/api/chat/sessions/${sessionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title }),
        }
      );

      setSessions((prev) =>
        prev.map((item) => (item.id === sessionId ? response.session : item))
      );

      setRenamingSessionId("");
      setRenameValue("");
    } catch (err: any) {
      setError(err?.message || "Erro ao renomear conversa.");
    }
  }

  function cancelRename() {
    setRenamingSessionId("");
    setRenameValue("");
  }

  return (
    <div className="chat-layout phase-6-layout">
      <aside className={`