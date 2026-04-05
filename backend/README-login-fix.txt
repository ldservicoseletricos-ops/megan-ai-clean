LOGIN FIX - Megan AI

Arquivos corrigidos:
- backend/controllers/auth.controller.js
- backend/routes/auth.route.js
- frontend/src/App.tsx
- database/login_auth_patch.sql

Ordem recomendada:
1) Rode database/login_auth_patch.sql no banco.
2) Substitua os arquivos do backend/frontend pelos corrigidos.
3) Redeploy backend.
4) Redeploy frontend.

Observações:
- O login com Google foi desativado temporariamente no frontend para não quebrar o fluxo principal.
- Se SMTP não estiver configurado, o cadastro ativa o usuário automaticamente para destravar o login.
