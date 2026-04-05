import React from "react";
import {
  ChatMemoryPayload,
  ProjectMemoryPayload,
  Session,
  UploadedFile,
  buildAssetUrl,
} from "../services/api";

type ConversationDetailsProps = {
  session: Session | null;
  files: UploadedFile[];
  memory: ChatMemoryPayload | null;
  projectMemory: ProjectMemoryPayload | null;
};

function formatFileSize(size?: number) {
  const bytes = Number(size || 0);

  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  if (value === undefined || value === null || value === "") return null;

  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{String(value)}</span>
    </div>
  );
}

function ConversationDetails({
  session,
  files,
  memory,
  projectMemory,
}: ConversationDetailsProps) {
  return (
    <aside className="conversation-details">
      <div className="details-card">
        <h3>Conversa</h3>
        <DetailRow label="Título" value={session?.title || "Nova conversa"} />
        <DetailRow label="ID" value={session?.id || "-"} />
        <DetailRow label="Atualizada" value={session?.updated_at || "-"} />
      </div>

      <div className="details-card">
        <h3>Memória</h3>
        <DetailRow label="Memórias usadas" value={memory?.used ?? 0} />
        <DetailRow label="Memórias atualizadas" value={memory?.updated ?? 0} />
      </div>

      <div className="details-card">
        <h3>Projeto atual</h3>
        <DetailRow label="Projeto" value={projectMemory?.project} />
        <DetailRow label="Categoria" value={projectMemory?.category} />
        <DetailRow label="Status" value={projectMemory?.status} />
        <DetailRow label="Objetivo" value={projectMemory?.objective} />
        <DetailRow label="Problema" value={projectMemory?.problem} />
        <DetailRow label="Próximo passo" value={projectMemory?.nextStep} />
      </div>

      <div className="details-card">
        <h3>Arquivos</h3>

        {files.length === 0 ? (
          <div className="details-empty">Nenhum arquivo nesta conversa.</div>
        ) : (
          <div className="details-files">
            {files.map((file, index) => {
              const href = buildAssetUrl(file.url);

              return (
                <div className="details-file-item" key={`${file.id || index}`}>
                  <div className="details-file-text">
                    <strong>{file.original_name || file.name || "Arquivo"}</strong>
                    <span>
                      {file.mime_type || "arquivo"} ·{" "}
                      {formatFileSize(file.size_bytes)}
                    </span>
                  </div>

                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="details-file-link"
                    >
                      Abrir
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

export default ConversationDetails;