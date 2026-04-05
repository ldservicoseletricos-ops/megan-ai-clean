interface SidebarProps {
  onNewChat: () => void;
}

export default function Sidebar({ onNewChat }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-badge">M</div>
        <div>
          <h1>Megan OS</h1>
          <p>Histórico real</p>
        </div>
      </div>

      <button className="new-chat-btn" onClick={onNewChat}>
        + Nova conversa
      </button>

      <div className="sidebar-footer">
        <strong>Luiz</strong>
        <span>Megan OS online</span>
      </div>
    </aside>
  );
}