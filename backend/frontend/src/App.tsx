import React, { useEffect, useMemo, useState } from "react";
import Chat from "./components/Chat";

type AuthResponse = {
  ok?: boolean;
  token?: string;
  user?: any;
  message?: string;
  error?: string;
};

const API_URL =
  (import.meta as any).env?.VITE_API_URL?.trim() ||
  "https://megan-ai.onrender.com";

function normalizeApiUrl(url: string) {
  return String(url || "").trim().replace(/\/+$/, "");
}

const BASE_URL = normalizeApiUrl(API_URL);
const TOKEN_KEY = "megan_token";
const USER_KEY = "megan_user";

function App() {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("Luiz");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const [user, setUser] = useState<any>(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const isAuthenticated = useMemo(() => !!user, [user]);

  useEffect(() => {
    bootstrapGoogleLogin();
  }, []);

  async function bootstrapGoogleLogin() {
    try {
      const url = new URL(window.location.href);
      const tokenFromUrl = url.searchParams.get("token");
      const userFromUrl = url.searchParams.get("user");
      const loginFromUrl = url.searchParams.get("login");

      if (tokenFromUrl) {
        localStorage.setItem(TOKEN_KEY, tokenFromUrl);
      }

      if (userFromUrl) {
        const parsedUser = JSON.parse(decodeURIComponent(userFromUrl));
        localStorage.setItem(USER_KEY, JSON.stringify(parsedUser));
        setUser(parsedUser);
      }

      if (loginFromUrl === "google") {
        setNotice("Login com Google realizado com sucesso");
      }

      if (tokenFromUrl || userFromUrl || loginFromUrl) {
        url.searchParams.delete("token");
        url.searchParams.delete("user");
        url.searchParams.delete("login");
        window.history.replaceState({}, "", url.toString());
      }
    } catch (err: any) {
      setError("Erro ao finalizar login com Google");
    }
  }

  async function handleSubmit() {
    try {
      setLoading(true);
      setError("");
      setNotice("");

      const path =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";

      const body =
        mode === "login"
          ? { email, password }
          : { name, email, password };

      const response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data: AuthResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao autenticar");
      }

      if (data.token) {
        localStorage.setItem(TOKEN_KEY, data.token);
      }

      if (data.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        setUser(data.user);
      }

      setNotice(
        data.message ||
          (mode === "login"
            ? "Login realizado com sucesso"
            : "Conta criada com sucesso")
      );
    } catch (err: any) {
      setError(err.message || "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleLogin() {
    setError("");
    setNotice("");
    window.location.href = `${BASE_URL}/api/auth/google/start`;
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }

  if (isAuthenticated) {
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

        <div className="auth-form">
          {mode === "register" && (
            <input
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}

          <input
            placeholder="Seu email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error ? <div className="auth-error">{error}</div> : null}
          {notice ? <div className="auth-notice">{notice}</div> : null}

          <button type="button" onClick={handleSubmit} disabled={loading}>
            {loading
              ? "Carregando..."
              : mode === "login"
              ? "Entrar"
              : "Criar conta"}
          </button>

          <button
            type="button"
            className="google-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            Continuar com Google
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;