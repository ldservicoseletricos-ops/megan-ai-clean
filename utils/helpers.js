export function safeJsonParse(value, fallback = {}) {
  if (typeof value !== "string") {
    return value ?? fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeDeviceLocation(deviceLocation) {
  if (!deviceLocation) return {};

  if (typeof deviceLocation === "string") {
    return safeJsonParse(deviceLocation, {});
  }

  if (typeof deviceLocation === "object") {
    return deviceLocation;
  }

  return {};
}

export function createProjectMemorySummary(memories = []) {
  const result = {
    project: null,
    category: null,
    status: null,
    objective: null,
    problem: null,
    nextStep: null,
  };

  for (const memory of memories) {
    const key = String(memory.memory_key || "").toLowerCase();
    const value = memory.memory_value || "";

    if (key === "project") result.project = value;
    if (key === "category") result.category = value;
    if (key === "status") result.status = value;
    if (key === "objective") result.objective = value;
    if (key === "problem") result.problem = value;
    if (key === "next_step") result.nextStep = value;
  }

  return result;
}