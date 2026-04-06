import express from "express";

const router = express.Router();

// 🔥 base radar (pode evoluir depois com API externa)
const RADARS = [
  {
    lat: -23.55052,
    lng: -46.633308,
    speedLimit: 60,
  },
];

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

router.post("/", (req, res) => {
  const { latitude, longitude } = req.body || {};

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number"
  ) {
    return res.status(400).json({
      ok: false,
      error: "latitude e longitude são obrigatórios",
    });
  }

  for (const radar of RADARS) {
    const distance = calculateDistance(
      latitude,
      longitude,
      radar.lat,
      radar.lng
    );

    // 🔥 AVISO LONGE (500m)
    if (distance < 0.5 && distance > 0.2) {
      return res.json({
        ok: true,
        alert: `⚠️ Radar em aproximação (${Math.round(distance * 1000)}m)`,
        radar: {
          distanceKm: distance,
          speedLimit: radar.speedLimit,
        },
      });
    }

    // 🔥 AVISO MÉDIO
    if (distance <= 0.2 && distance > 0.05) {
      return res.json({
        ok: true,
        alert: `🚨 Radar próximo! Limite ${radar.speedLimit} km/h`,
        radar: {
          distanceKm: distance,
          speedLimit: radar.speedLimit,
        },
      });
    }

    // 🔥 MUITO PERTO
    if (distance <= 0.05) {
      return res.json({
        ok: true,
        alert: `🚨🚨 Radar IMEDIATO! Reduza!`,
        radar: {
          distanceKm: distance,
          speedLimit: radar.speedLimit,
        },
      });
    }
  }

  return res.json({ ok: true });
});

export default router;