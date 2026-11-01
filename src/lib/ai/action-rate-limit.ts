const windowMs = 60_000;
const maximumRequests = 20;
const requestsByUser = new Map<string, number[]>();

export function consumeAIActionRequest(userId: string, now = Date.now()) {
  const requests = (requestsByUser.get(userId) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (requests.length >= maximumRequests) {
    requestsByUser.set(userId, requests);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((requests[0]! + windowMs - now) / 1000)),
    };
  }
  requests.push(now);
  requestsByUser.set(userId, requests);
  if (requestsByUser.size > 5_000) {
    for (const [key, timestamps] of requestsByUser) {
      if (timestamps.every((timestamp) => now - timestamp >= windowMs)) requestsByUser.delete(key);
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}
