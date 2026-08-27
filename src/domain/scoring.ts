import type { ScoreComponents } from "@/src/domain/models";
import type { UsageOutcome, Verification } from "@/src/domain/enums";
import { VERIFICATION_SCORE } from "@/src/domain/enums";

export const SCORING_WEIGHTS: Readonly<Record<keyof ScoreComponents, number>> = {
  semantic_relevance: 0.35,
  lexical_relevance: 0.1,
  graph_activation: 0.2,
  verification_confidence: 0.15,
  importance_salience: 0.1,
  recency_usefulness: 0.1,
};

export const RRF_K = 60;
export const GRAPH_DEPTH_DECAY = 0.72;
export const GRAPH_FANOUT_LIMIT = 24;

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

export function reciprocalRankFusion(
  rankedLists: Array<Array<{ id: string; score: number }>>,
  k = RRF_K,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((item, index) => {
      result.set(item.id, (result.get(item.id) ?? 0) + 1 / (k + index + 1));
    });
  }
  const maximum = Math.max(0, ...result.values());
  if (maximum > 0) {
    for (const [id, score] of result) result.set(id, score / maximum);
  }
  return result;
}

export function graphActivation(
  parentActivation: number,
  edgeStrength: number,
  edgeConfidence: number,
  decay = GRAPH_DEPTH_DECAY,
): number {
  return clamp(parentActivation * clamp(edgeStrength) * clamp(edgeConfidence) * clamp(decay));
}

export function verificationConfidence(verification: Verification, confidence: number): number {
  return clamp(VERIFICATION_SCORE[verification] * 0.55 + clamp(confidence) * 0.45);
}

export function recencyScore(updatedAt: Date, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - updatedAt.getTime()) / 86_400_000);
  return clamp(Math.exp(-ageDays / 365));
}

export function scoreComponents(components: ScoreComponents): number {
  return clamp(
    Object.entries(SCORING_WEIGHTS).reduce(
      (sum, [key, weight]) => sum + clamp(components[key as keyof ScoreComponents]) * weight,
      0,
    ),
  );
}

export const REINFORCEMENT_DELTAS: Readonly<Record<UsageOutcome, number>> = {
  SUPPLIED: 0,
  USED: 0.01,
  IGNORED: -0.005,
  HELPED_APPROVAL: 0.03,
  CONTRIBUTED_TO_REJECTION: -0.03,
  CORRECTED: -0.05,
  CONTRADICTED: -0.04,
};

export function reinforceUsefulness(current: number, outcome: UsageOutcome): number {
  return clamp(current + REINFORCEMENT_DELTAS[outcome], 0.1, 0.9);
}
