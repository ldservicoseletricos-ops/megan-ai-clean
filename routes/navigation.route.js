import express from "express";
import { getNavigationSnapshot } from "../services/tool.service.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const data = await getNavigationSnapshot(req.body || {});

    res.json({
      ok: true,
      ...data,
    });
  } catch (error) {
    console.error("Erro navigation:", error);
    res.status(500).json({
      ok: false,
      error: "Erro ao obter dados de navegação",
    });
  }
});

export default router;