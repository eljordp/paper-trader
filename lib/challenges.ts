export type ChallengeType = "use_stop" | "profitable_close" | "set_target";

export const CHALLENGES: Record<
  ChallengeType,
  { title: string; description: string; rule: string }
> = {
  use_stop: {
    title: "Always use a stop",
    description: "Place at least one buy today with a stop loss attached.",
    rule: "Stop loss = your written-down rule. Use it.",
  },
  profitable_close: {
    title: "Close green",
    description: "Close at least one trade for profit today.",
    rule: "Cutting a winner is a skill. Don't let one give back.",
  },
  set_target: {
    title: "Set a target",
    description: "Place at least one buy today with a take profit set.",
    rule: "Decide your exit before you enter. Plan beats hope.",
  },
};

export const CHALLENGE_TYPES: ChallengeType[] = [
  "use_stop",
  "profitable_close",
  "set_target",
];

export function pickTodayChallenge(userId: string, dateStr: string): ChallengeType {
  let hash = 0;
  const seed = userId + dateStr;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return CHALLENGE_TYPES[Math.abs(hash) % CHALLENGE_TYPES.length];
}

export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}
