import { describe, expect, it } from "vitest";
import { createLudoGame, getLegalTokenMoves, globalSquare, moveLudoToken, rollLudo } from "./ludo-engine";

describe("ludo engine", () => {
  it("accepts only 2 to 4 players", () => {
    expect(() => createLudoGame(1)).toThrow();
    expect(() => createLudoGame(5)).toThrow();
    expect(createLudoGame(4).tokens).toHaveLength(4);
  });

  it("requires a six to leave base", () => {
    const game = createLudoGame(2);
    expect(getLegalTokenMoves(game, 5)).toEqual([]);
    expect(getLegalTokenMoves(game, 6)).toEqual([0, 1, 2, 3]);
  });

  it("moves a token out of base and grants another turn on six", () => {
    const rolled = rollLudo(createLudoGame(2), 6);
    const moved = moveLudoToken(rolled, 0);
    expect(moved.tokens[0][0]).toBe(0);
    expect(moved.currentPlayer).toBe(0);
  });

  it("does not allow a move beyond the exact finish", () => {
    const state = { ...createLudoGame(2), tokens: [[56, -1, -1, -1], [-1, -1, -1, -1]], lastRoll: null };
    expect(getLegalTokenMoves(state, 2)).toEqual([]);
    expect(getLegalTokenMoves(state, 1)).toEqual([0]);
  });

  it("captures an opponent on a non-safe square", () => {
    const state = {
      ...createLudoGame(2),
      tokens: [[4, -1, -1, -1], [44, -1, -1, -1]],
    };
    const moved = moveLudoToken(rollLudo(state, 1), 0);
    expect(moved.tokens[0][0]).toBe(5);
    expect(moved.tokens[1][0]).toBe(-1);
    expect(moved.currentPlayer).toBe(0);
  });

  it("does not capture on a safe square", () => {
    const state = {
      ...createLudoGame(2),
      tokens: [[7, -1, -1, -1], [47, -1, -1, -1]],
    };
    const moved = moveLudoToken(rollLudo(state, 1), 0);
    expect(moved.tokens[1][0]).toBe(0);
  });

  it("skips a turn after three consecutive sixes", () => {
    let state = createLudoGame(2);
    state = rollLudo(state, 6);
    state = moveLudoToken(state, 0);
    state = rollLudo(state, 6);
    state = moveLudoToken(state, 0);
    state = rollLudo(state, 6);
    expect(state.currentPlayer).toBe(1);
    expect(state.lastRoll).toBeNull();
  });

  it("maps track positions around the 52-square circuit", () => {
    expect(globalSquare(0, 0)).toBe(0);
    expect(globalSquare(1, 0)).toBe(13);
    expect(globalSquare(0, 50)).toBe(50);
  });
});
