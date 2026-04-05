import jwt from "jsonwebtoken";

/*
  =========================
  REGISTER
  =========================
*/
export const registerUser = async (req, res) => {
  try {
    return res.json({
      ok: true,
      message: "Usuário registrado (mock)",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Erro no registro",
    });
  }
};

/*
  =========================
  LOGIN
  =========================
*/
export const loginUser = async (req, res) => {
  try {
    const token = jwt.sign(
      { id: 1, email: "test@email.com" },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "7d" }
    );

    return res.json({
      ok: true,
      token,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Erro no login",
    });
  }
};

/*
  =========================
  GOOGLE LOGIN
  =========================
*/
export const googleLogin = async (req, res) => {
  try {
    return res.json({
      ok: true,
      message: "Login Google mock",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Erro Google",
    });
  }
};

/*
  =========================
  CALLBACK GOOGLE
  =========================
*/
export const googleCallbackController = async (req, res) => {
  try {
    return res.json({
      ok: true,
      message: "Callback Google",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Erro callback Google",
    });
  }
};

/*
  =========================
  GET ME
  =========================
*/
export const getMe = async (req, res) => {
  try {
    return res.json({
      ok: true,
      user: req.user || null,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Erro ao obter usuário",
    });
  }
};