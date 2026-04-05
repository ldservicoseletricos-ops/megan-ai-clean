export const ROLES = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
};

export const MEMORY_TYPES = {
  PROFILE: "profile",
  PREFERENCE: "preference",
  PROJECT: "project",
};

export const ALLOWED_MESSAGE_ROLES = new Set(["user", "assistant", "system"]);