/**
 * Pure builder for the ICE configuration returned by `GET /calls/ice-config`.
 *
 * Deterministic rules (Requirement 10.2–10.4, 10.8):
 *  - STUN `stun:stun.l.google.com:19302` is ALWAYS the first entry.
 *  - TURN entry is appended ONLY when `env.TURN_URL` is a non-empty string.
 *  - No external I/O — safe to call on every request without latency impact.
 *
 * Keeping the function pure (and isolated from Fastify / Fastify env globals)
 * makes it trivial to unit- and property-test in isolation.
 */

export type IceServer =
  | { urls: string }
  | { urls: string; username: string; credential: string };

export type IceConfigEnv = {
  TURN_URL?: string;
  TURN_USERNAME?: string;
  TURN_PASSWORD?: string;
};

export const STUN_URL = "stun:stun.l.google.com:19302";

export function buildIceServers(env: IceConfigEnv): IceServer[] {
  const iceServers: IceServer[] = [{ urls: STUN_URL }];
  if (env.TURN_URL) {
    iceServers.push({
      urls: env.TURN_URL,
      username: env.TURN_USERNAME ?? "",
      credential: env.TURN_PASSWORD ?? "",
    });
  }
  return iceServers;
}
