"use client";

import confetti from "canvas-confetti";

const TIER_COLORS_HEX = ["#00e394", "#3b82f6", "#a855f7", "#f59e0b", "#ec4899", "#4fdce0"];

export function celebrateChallenge() {
  confetti({
    particleCount: 60,
    spread: 60,
    startVelocity: 25,
    origin: { x: 0.5, y: 0.4 },
    colors: ["#ff6b35", "#f5c542", "#00e394"],
    scalar: 0.8,
  });
}

export function celebrateEvalPass() {
  const end = Date.now() + 1500;
  const fire = () => {
    confetti({
      particleCount: 90,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.6 },
      colors: TIER_COLORS_HEX,
    });
    confetti({
      particleCount: 90,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.6 },
      colors: TIER_COLORS_HEX,
    });
    if (Date.now() < end) requestAnimationFrame(fire);
  };
  fire();
}

export function celebrateTierUnlock() {
  confetti({
    particleCount: 150,
    spread: 100,
    origin: { x: 0.5, y: 0.3 },
    colors: TIER_COLORS_HEX,
    scalar: 1.2,
    ticks: 200,
  });
}
