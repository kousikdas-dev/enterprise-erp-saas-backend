const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

export function parseExpiresInToSeconds(expiresIn: string): number {
  const match = /^(\d+)([smhd])$/i.exec(expiresIn.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${expiresIn}". Use a value like 15m, 7d, 3600s, or 12h.`,
    );
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  return amount * UNIT_SECONDS[unit];
}
