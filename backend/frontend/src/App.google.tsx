import React, { useEffect, useMemo, useState } from "react";
import "./styles.css";

type User = {
  id: string;
  email: string;
  name: string;
  plan: string;
  externalId: string;
  emailVerified?: boolean;
  role?: string;
  googleId?: string | null;
};

type AuthResponse = {
  ok: boolean;
  message?: string;
  token?: string;
  user?: User;
  verifyToken?: string;
  error?: string;
};

const ENV_API_BASE = import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "";
const API_BASE = ENV_API_BASE || "https://megan-ai.onrender.com";

function parseUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function App() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [sessionUser, setSessionUser] = useState<User | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const query = useMemo(() => new URLSearchParams(window.location.search), []);

  async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || data?.message || "Erro");
    }

    return data as T;
  }

  function saveSession(data: Pick<AuthResponse, "token" | "user">) {
    if (!data.token) throw new Error("Token não retornado");
    localStorage.setItem("megan_token", data.token);
    localStorage.setItem("megan_user", JSON.stringify(data.user || {}));
    setSessionUser(data.user || null);
  }

  function clearSession() {
    localStorage.removeItem("megan_token");
    localStorage.removeItem("megan_user");
    setSessionUser(null);
  }

  useEffect(() => {
    const tokenFromUrl = query.get("token");
    const userFromUrl = query.get("user");
    const loginStatus = query.get("login");
    const loginMessage = query.get("message");
    const verifyToken = query.get("verify");

    if (tokenFromUrl) {
      saveSession({ token: tokenFromUrl, user: parseUser(userFromUrl) || undefined });
      setAuthNotice("Login com Google realizado com sucesso");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (loginStatus === "error") {
      setAuthError(loginMessage || "Falha no login com Google");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (verifyToken) {
      setLoadingAuth(true);
      apiRequest<AuthResponse>(`/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`)
        .then((data) => {
          setAuthNotice(data.message || "Email confirmado com sucesso");
          setMode("login");
        })
        .catch((err: Error) => setAuthError(err.message))
        .finally(() => {
          setLoadingAuth(false);
          window.history.replaceState({}, document.title, window.location.pathname);
        });
      return;
    }

    const storedToken = localStorage.getItem("megan_token");
    const storedUser = parseUser(localStorage.getItem("megan_user"));
    if (storedToken && storedUser) {
      setSessionUser(storedUser);
    }
  }, [query]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setLoadingAuth(true);

    try {
      const data = await apiRequest<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      saveSession(data);
      setAuthNotice("Login realizado com sucesso");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Erro no login");
    } finally {
      setLoadingAuth(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setLoadingAuth(true);

    try {
      const data = await apiRequest<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: registerName,
          email: registerEmail,
          password: registerPassword,
        }),
      });

      setAuthNotice(data.message || "Conta criada com sucesso");
      if (data.verifyToken) {
        setAuthNotice(`Conta criada. Como o SMTP não está configurado, confirme manualmente pelo token: ${data.verifyToken}`);
      }
      setMode("login");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Erro ao criar conta");
    } finally {
      setLoadingAuth(false);
    }
  }

  function handleGoogleLogin() {
    window.location.href = `${API_BASE}/api/auth/google`;
  }

  if (sessionUser) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="brand-badge">Megan OS SaaS</div>
          <h1 className="auth-title">Login concluído</h1>
          <div className="auth-success">
            Bem-vindo, <strong>{sessionUser.name || sessionUser.email}</strong>.
          </div>
          <p style={{ color: "#cbd5e1", marginTop: 12 }}>
            Plano: {sessionUser.plan || "free"}
          </p>
          <button type="button" onClick={clearSession} style={{ marginTop: 16 }}>
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand-badge">Megan OS SaaS</div>
        <h1 className="auth-title">Login profissional</h1>

        <div className="auth-tabs">
          <button type="button" onClick={() => setMode("login")}>Entrar</button>
          <button type="button" onClick={() => setMode("register")}>Criar conta</button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin}>
            <input
              placeholder="Email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
            />

            <input
              type="password"
              placeholder="Senha"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />

            {authError && <div className="auth-error">{authError}</div>}
            {authNotice && <div className="auth-success">{authNotice}</div>}

            <button type="submit" disabled={loadingAuth}>
              {loadingAuth ? "Entrando..." : "Entrar"}
            </button>

            <button type="button" onClick={handleGoogleLogin} disabled={loadingAuth}>
              Continuar com Google
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <input
              placeholder="Nome"
              value={registerName}
              onChange={(e) => setRegisterName(e.target.value)}
            />

            <input
              placeholder="Email"
              value={registerEmail}
              onChange={(e) => setRegisterEmail(e.target.value)}
            />

            <input
              type="password"
              placeholder="Senha"
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
            />

            {authError && <div className="auth-error">{authError}</div>}
            {authNotice && <div className="auth-success">{authNotice}</div>}

            <button type="submit" disabled={loadingAuth}>
              {loadingAuth ? "Criando..." : "Criar conta"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
