import { describe, expect, it } from "vitest";
import {
  graphActivation,
  reciprocalRankFusion,
  reinforceUsefulness,
  scoreComponents,
  SCORING_WEIGHTS,
} from "@/src/domain/scoring";

describe("inspectable retrieval scoring", () => {
  it("keeps configured weights centralized and normalized", () => {
    expect(Object.values(SCORING_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(
      scoreComponents({
        semantic_relevance: 1,
        lexical_relevance: 1,
        graph_activation: 1,
        verification_confidence: 1,
        importance_salience: 1,
        recency_usefulness: 1,
      }),
    ).toBeCloseTo(1);
  });

  it("fuses semantic and lexical rankings deterministically", () => {
    const first = reciprocalRankFusion([
      [
        { id: "a", score: 1 },
        { id: "b", score: 0.8 },
      ],
      [
        { id: "b", score: 1 },
        { id: "c", score: 0.7 },
      ],
    ]);
    const second = reciprocalRankFusion([
      [
        { id: "a", score: 1 },
        { id: "b", score: 0.8 },
      ],
      [
        { id: "b", score: 1 },
        { id: "c", score: 0.7 },
      ],
    ]);
    expect([...first]).toEqual([...second]);
    expect(first.get("b")).toBe(1);
  });

  it("decays activation on every graph hop", () => {
    const oneHop = graphActivation(1, 0.9, 0.8);
    const twoHops = graphActivation(oneHop, 0.9, 0.8);
    expect(oneHop).toBeLessThan(1);
    expect(twoHops).toBeLessThan(oneHop);
  });

  it("caps positive and negative usage reinforcement", () => {
    let high = 0.5;
    let low = 0.5;
    for (let index = 0; index < 100; index += 1) {
      high = reinforceUsefulness(high, "HELPED_APPROVAL");
      low = reinforceUsefulness(low, "CORRECTED");
    }
    expect(high).toBe(0.9);
    expect(low).toBe(0.1);
  });
});
