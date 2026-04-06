import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";

// 🔥 DEBUG GLOBAL (NÃO REMOVE NADA EXISTENTE)
window.addEventListener("error", (event) => {
  console.error("ERRO_GLOBAL_MEGAN:", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("PROMISE_REJEITADA_MEGAN:", event.reason);
});

console.log("🚀 MEGAN OS INICIOU main.tsx");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);