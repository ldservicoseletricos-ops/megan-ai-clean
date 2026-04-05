import { getWeatherSnapshot } from "../services/tool.service.js";

export async function getWeather(req, res, next) {
  try {
    const location =
      req.query?.location ||
      req.body?.location ||
      "Diadema,SP,BR";

    const weather = await getWeatherSnapshot(String(location));

    res.json({
      ok: true,
      weather,
    });
  } catch (error) {
    next(error);
  }
}