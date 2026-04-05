import { env } from "../config/env.js";

const FORECAST_BASE_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_BASE_URL = "https://geocoding-api.open-meteo.com/v1/search";

async function geocodeCity(city) {
  if (!city) return null;

  const url = `${GEOCODING_BASE_URL}?name=${encodeURIComponent(
    city
  )}&count=1&language=pt&format=json`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Falha no geocoding: ${response.status}`);
  }

  const data = await response.json();
  const place = data?.results?.[0];

  if (!place) return null;

  return {
    name: place.name,
    country: place.country,
    admin1: place.admin1,
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

function weatherCodeToText(code) {
  const map = {
    0: "céu limpo",
    1: "predominantemente limpo",
    2: "parcialmente nublado",
    3: "nublado",
    45: "neblina",
    48: "neblina com geada",
    51: "garoa fraca",
    53: "garoa moderada",
    55: "garoa intensa",
    56: "garoa congelante fraca",
    57: "garoa congelante intensa",
    61: "chuva fraca",
    63: "chuva moderada",
    65: "chuva forte",
    66: "chuva congelante fraca",
    67: "chuva congelante forte",
    71: "neve fraca",
    73: "neve moderada",
    75: "neve forte",
    77: "flocos de neve",
    80: "pancadas de chuva fracas",
    81: "pancadas de chuva moderadas",
    82: "pancadas de chuva fortes",
    85: "pancadas de neve fracas",
    86: "pancadas de neve fortes",
    95: "trovoadas",
    96: "trovoadas com granizo fraco",
    99: "trovoadas com granizo forte",
  };

  return map[code] || "condição indefinida";
}

function toHourLabel(isoString, timezone) {
  try {
    return new Date(isoString).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone || env.defaultTimezone || "America/Sao_Paulo",
    });
  } catch {
    return isoString;
  }
}

function pickNextHours(hourly = {}, count = 8) {
  const times = hourly.time || [];
  const temperatures = hourly.temperature_2m || [];
  const apparent = hourly.apparent_temperature || [];
  const precipitations = hourly.precipitation_probability || [];
  const weatherCodes = hourly.weather_code || [];
  const winds = hourly.wind_speed_10m || [];

  const now = Date.now();
  const result = [];

  for (let i = 0; i < times.length; i++) {
    const ts = new Date(times[i]).getTime();
    if (Number.isNaN(ts) || ts < now - 60 * 60 * 1000) continue;

    result.push({
      time: times[i],
      label: toHourLabel(times[i], env.defaultTimezone),
      temperature: temperatures[i] ?? null,
      apparentTemperature: apparent[i] ?? null,
      precipitationProbability: precipitations[i] ?? null,
      weatherCode: weatherCodes[i] ?? null,
      condition: weatherCodeToText(weatherCodes[i]),
      wind: winds[i] ?? null,
    });

    if (result.length >= count) break;
  }

  return result;
}

function buildTodaySummary(daily = {}) {
  const tempMax = daily.temperature_2m_max?.[0] ?? null;
  const tempMin = daily.temperature_2m_min?.[0] ?? null;
  const precip = daily.precipitation_probability_max?.[0] ?? null;
  const weatherCode = daily.weather_code?.[0] ?? null;

  return {
    temperatureMax: tempMax,
    temperatureMin: tempMin,
    precipitationProbabilityMax: precip,
    weatherCode,
    condition: weatherCodeToText(weatherCode),
  };
}

function findRainWindows(nextHours = []) {
  const rainyHours = nextHours.filter(
    (hour) => (hour?.precipitationProbability ?? 0) >= 40
  );

  return rainyHours.map((hour) => ({
    label: hour.label,
    precipitationProbability: hour.precipitationProbability,
    condition: hour.condition,
  }));
}

function findBestHoursToGoOut(nextHours = []) {
  const ranked = [...nextHours]
    .filter((hour) => hour?.temperature !== null && hour?.temperature !== undefined)
    .sort((a, b) => {
      const rainA = a?.precipitationProbability ?? 100;
      const rainB = b?.precipitationProbability ?? 100;
      if (rainA !== rainB) return rainA - rainB;

      const windA = a?.wind ?? 999;
      const windB = b?.wind ?? 999;
      if (windA !== windB) return windA - windB;

      return 0;
    });

  return ranked.slice(0, 3).map((hour) => ({
    label: hour.label,
    temperature: hour.temperature,
    precipitationProbability: hour.precipitationProbability,
    condition: hour.condition,
    wind: hour.wind,
  }));
}

function buildRainSummary(today, rainWindows) {
  const maxRain = today?.precipitationProbabilityMax;

  if (maxRain === null || maxRain === undefined) {
    return "Não foi possível estimar a chance de chuva hoje.";
  }

  if (maxRain < 20) {
    return "A chance de chuva hoje está baixa.";
  }

  if (!rainWindows.length) {
    return `A chance máxima de chuva hoje é de ${Math.round(maxRain)}%, mas sem janela horária forte nas próximas horas.`;
  }

  const first = rainWindows[0];
  return `Há possibilidade de chuva hoje, com maior chance começando por volta de ${first.label}.`;
}

function buildPremiumSummary({ current, today, rainSummary }) {
  const parts = [];

  if (current?.condition) {
    parts.push(current.condition);
  }

  if (current?.temperature !== null && current?.temperature !== undefined) {
    parts.push(`agora ${Math.round(current.temperature)}°C`);
  }

  if (
    today?.temperatureMax !== null &&
    today?.temperatureMax !== undefined &&
    today?.temperatureMin !== null &&
    today?.temperatureMin !== undefined
  ) {
    parts.push(
      `mínima de ${Math.round(today.temperatureMin)}°C e máxima de ${Math.round(
        today.temperatureMax
      )}°C`
    );
  }

  if (
    today?.precipitationProbabilityMax !== null &&
    today?.precipitationProbabilityMax !== undefined
  ) {
    parts.push(`chance de chuva de ${Math.round(today.precipitationProbabilityMax)}%`);
  }

  if (rainSummary) {
    parts.push(rainSummary);
  }

  return parts.join(", ");
}

export async function getRealWeather({ lat, lon, city } = {}) {
  try {
    let latitude = lat;
    let longitude = lon;
    let resolvedLocation = city || env.defaultWeatherCity || "Sao Paulo";

    if ((!latitude || !longitude) && city) {
      const geo = await geocodeCity(city);
      if (geo) {
        latitude = geo.latitude;
        longitude = geo.longitude;
        resolvedLocation = [geo.name, geo.admin1, geo.country]
          .filter(Boolean)
          .join(", ");
      }
    }

    if (!latitude || !longitude) {
      const fallbackGeo = await geocodeCity(env.defaultWeatherCity || "Sao Paulo");

      if (!fallbackGeo) {
        return {
          source: "open-meteo",
          location: resolvedLocation,
          temperature: null,
          condition: "indisponível",
          summary: "Não foi possível localizar a cidade para consultar o clima.",
          today: null,
          nextHours: [],
          rainWindows: [],
          bestHoursToGoOut: [],
          rainSummary: null,
          premiumCard: null,
        };
      }

      latitude = fallbackGeo.latitude;
      longitude = fallbackGeo.longitude;
      resolvedLocation = [fallbackGeo.name, fallbackGeo.admin1, fallbackGeo.country]
        .filter(Boolean)
        .join(", ");
    }

    const timezone = env.defaultTimezone || "America/Sao_Paulo";

    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      timezone,
      forecast_days: "1",
      current: [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "weather_code",
        "wind_speed_10m",
      ].join(","),
      hourly: [
        "temperature_2m",
        "apparent_temperature",
        "precipitation_probability",
        "weather_code",
        "wind_speed_10m",
      ].join(","),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max",
      ].join(","),
    });

    const url = `${FORECAST_BASE_URL}?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Falha Open-Meteo: ${response.status}`);
    }

    const data = await response.json();
    const currentRaw = data?.current || {};
    const hourlyRaw = data?.hourly || {};
    const dailyRaw = data?.daily || {};

    const current = {
      temperature: currentRaw.temperature_2m ?? null,
      apparentTemperature: currentRaw.apparent_temperature ?? null,
      humidity: currentRaw.relative_humidity_2m ?? null,
      wind: currentRaw.wind_speed_10m ?? null,
      weatherCode: currentRaw.weather_code ?? null,
      condition: weatherCodeToText(currentRaw.weather_code),
    };

    const today = buildTodaySummary(dailyRaw);
    const nextHours = pickNextHours(hourlyRaw, 8);
    const rainWindows = findRainWindows(nextHours);
    const bestHoursToGoOut = findBestHoursToGoOut(nextHours);
    const rainSummary = buildRainSummary(today, rainWindows);

    const premiumCard = {
      title: "Clima de hoje",
      location: resolvedLocation,
      current: {
        temperature: current.temperature,
        apparentTemperature: current.apparentTemperature,
        humidity: current.humidity,
        wind: current.wind,
        condition: current.condition,
      },
      today,
      nextHours,
      rainWindows,
      bestHoursToGoOut,
      rainSummary,
    };

    return {
      source: "open-meteo",
      location: resolvedLocation,
      latitude,
      longitude,
      temperature: current.temperature,
      apparentTemperature: current.apparentTemperature,
      humidity: current.humidity,
      wind: current.wind,
      condition: current.condition,
      summary: buildPremiumSummary({ current, today, rainSummary }),
      today,
      nextHours,
      rainWindows,
      bestHoursToGoOut,
      rainSummary,
      premiumCard,
    };
  } catch {
    return {
      source: "open-meteo",
      location: city || env.defaultWeatherCity || "Sao Paulo",
      temperature: null,
      apparentTemperature: null,
      humidity: null,
      wind: null,
      condition: "erro",
      summary: "Falha ao consultar clima no Open-Meteo.",
      today: null,
      nextHours: [],
      rainWindows: [],
      bestHoursToGoOut: [],
      rainSummary: null,
      premiumCard: null,
    };
  }
}