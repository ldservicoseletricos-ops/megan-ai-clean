import React from "react";
import {
  ChatMemoryPayload,
  MeganMode,
  ProjectMemoryPayload,
  Session,
  User,
} from "../services/api";

type AdminPanelProps = {
  user: User | null;
  sessions: Session[];
  currentSession: Session | null;
  currentMode: MeganMode;
  memory: ChatMemoryPayload | null;
  projectMemory: ProjectMemoryPayload | null;
};

function AdminPanel({
  user,
  sessions,
  currentSession,
  currentMode,
  memory,
  projectMemory,
}: AdminPanelProps) {
  const isAdmin = String(user?.email || "").toLowerCase().includes("luiz");

  if (!isAdmin) return null;

  return (
    <div className="admin-panel">
      <div className="admin-card">
        <h3>Painel Admin</h3>
        <div className="admin-grid">
          <div className="admin-stat">
            <span>Modo atual</span>
            <strong>{currentMode}</strong>
          </div>
          <div className="admin-stat">
            <span>Total de conversas</span>
            <strong>{sessions.length}</strong>
          </div>
          <div className="admin-stat">
            <span>Memórias usadas</span>
            <strong>{memory?.used ?? 0}</strong>
          </div>
          <div className="admin-stat">
            <span>Memórias atualizadas</span>
            <strong>{memory?.updated ?? 0}</strong>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h3>Conversa ativa</h3>
        <div className="admin-list">
          <div>
            <span>Título</span>
            <strong>{currentSession?.title || "Nova conversa"}</strong>
          </div>
          <div>
            <span>ID</span>
            <strong>{currentSession?.id || "-"}</strong>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h3>Projeto</h3>
        <div className="admin-list">
          <div>
            <span>Projeto</span>
            <strong>{projectMemory?.project || "-"}</strong>
          </div>
          <div>
            <span>Objetivo</span>
            <strong>{projectMemory?.objective || "-"}</strong>
          </div>
          <div>
            <span>Próximo passo</span>
            <strong>{projectMemory?.nextStep || "-"}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;