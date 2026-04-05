import express from "express";

const router = express.Router();

// base simples de radar (exemplo)
const RADARS = [
  {
    lat: -23.55052,
    lng: -46.633308,
    speedLimit: 60,
  }
];

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

router.post("/", (req, res) => {
  const { latitude, longitude, speed } = req.body;

  for (const radar of RADARS) {
    const distance = calculateDistance(
      latitude,
      longitude,
      radar.lat,
      radar.lng
    );

    if (distance < 0.5) {
      return res.json({
        alert: `🚨 Radar à frente! Limite: ${radar.speedLimit} km/h`,
      });
    }
  }

  return res.json({ ok: true });
});

export default router;