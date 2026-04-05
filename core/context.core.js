import { listMessagesBySession } from "../models/chat.model.js";
import { getUserMemories } from "../services/memory.service.js";

export async function buildContext({ userId, sessionId }) {
  const history = sessionId
    ? await listMessagesBySession(sessionId, userId, 30)
    : [];

  const memoryData = await getUserMemories(userId);

  return {
    history,
    memories: memoryData.memories,
    activeMemories: memoryData.activeMemories,
    projectMemory: memoryData.projectMemory,
    profileSummary: memoryData.profileSummary,
    memoryStats: memoryData.stats,
  };
}
