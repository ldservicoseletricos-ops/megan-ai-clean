import React, { useEffect, useState } from "react";
import Chat from "./components/Chat";
import {
  apiRequest,
  getStoredUser,
  setStoredSession,
  clearStoredSession,
  User,
} from "./services/api";

function App() {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");

  useEffect(() => {
    const storedUser = getStoredUser();
    if (storedUser) {
      setUser(storedUser);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";

      const payload =
        mode === "login"
          ? {
              email,
              password,
            }
          : {
              name,
              email,
              password,
            };

      const data = await apiRequest<any>(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setStoredSession(data.token, data.user);
      setUser(data.user);
    } catch (err: any) {
      setError(err?.message || "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearStoredSession();
    setUser(null);
  }

  if (user) {
    return <Chat user={user} onLogout={handleLogout} />;
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">M</div>
          <div>
            <h1>Megan OS</h1>
            <p>Login, chat estilo ChatGPT e autenticação real</p>
          </div>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Entrar
          </button>

          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "register" && (
            <input
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}

          <input
            placeholder="Seu email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading
              ? "Carregando..."
              : mode === "login"
              ? "Entrar"
              : "Criar conta"}
          </button>
        </form>

        <button type="button" className="google-btn">
          Continuar com Google
        </button>
      </div>
    </div>
  );
}

export default App;