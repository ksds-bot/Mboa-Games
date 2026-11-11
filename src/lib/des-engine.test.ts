import { describe, expect, it } from "vitest";
import { evaluateThrows, validateDiceConfig, type DiceThrow } from "./des-engine";

describe("Le 2 Dès", () => {
  it("accepte 2 à 4 dés, 2 à 10 joueurs et un Million de 1 à 6", () => {
    expect(() => validateDiceConfig({ diceCount: 4, playerCount: 10, millionFace: 6 })).not.toThrow();
  });

  it("refuse les paramètres hors limites", () => {
    expect(() => validateDiceConfig({ diceCount: 1, playerCount: 2, millionFace: 1 })).toThrow();
    expect(() => validateDiceConfig({ diceCount: 2, playerCount: 11, millionFace: 1 })).toThrow();
    expect(() => validateDiceConfig({ diceCount: 2, playerCount: 2, millionFace: 7 })).toThrow();
  });

  it("donne la victoire directe à un Million", () => {
    const throws: DiceThrow[] = [
      { playerIndex: 0, dice: [1, 1], total: 2, isMillion: true },
      { playerIndex: 1, dice: [6, 6], total: 12, isMillion: false },
    ];
    const result = evaluateThrows(throws, 2, 2, 1);
    expect(result.winnerIndex).toBe(0);
    expect(result.million).toBe(true);
  });

  it("fait relancer uniquement les joueurs qui ont fait Million", () => {
    const throws: DiceThrow[] = [
      { playerIndex: 0, dice: [1, 1], total: 2, isMillion: true },
      { playerIndex: 1, dice: [6, 6], total: 12, isMillion: false },
      { playerIndex: 2, dice: [1, 1], total: 2, isMillion: true },
    ];
    const result = evaluateThrows(throws, 3, 2, 1);
    expect(result.winnerIndex).toBeNull();
    expect(result.contenders).toEqual([0, 2]);
    expect(result.tied).toBe(true);
  });

  it("fait relancer uniquement les joueurs à égalité au meilleur total", () => {
    const throws: DiceThrow[] = [
      { playerIndex: 0, dice: [6, 3], total: 9, isMillion: false },
      { playerIndex: 1, dice: [4, 5], total: 9, isMillion: false },
      { playerIndex: 2, dice: [2, 3], total: 5, isMillion: false },
    ];
    const result = evaluateThrows(throws, 3, 2, 1);
    expect(result.winnerIndex).toBeNull();
    expect(result.contenders).toEqual([0, 1]);
  });

  it("déclare le seul meilleur total gagnant", () => {
    const throws: DiceThrow[] = [
      { playerIndex: 0, dice: [6, 3], total: 9, isMillion: false },
      { playerIndex: 1, dice: [4, 5], total: 9, isMillion: false },
      { playerIndex: 2, dice: [6, 6], total: 12, isMillion: false },
    ];
    expect(evaluateThrows(throws, 3, 2, 1).winnerIndex).toBe(2);
  });

  it("rejette les joueurs dupliqués et les index hors limites", () => {
    const duplicate: DiceThrow[] = [
      { playerIndex: 0, dice: [2, 3], total: 5, isMillion: false },
      { playerIndex: 0, dice: [4, 5], total: 9, isMillion: false },
    ];
    expect(() => evaluateThrows(duplicate, 2, 2, 1)).toThrow("Joueur invalide");
    expect(() => evaluateThrows([
      { playerIndex: 2, dice: [2, 3], total: 5, isMillion: false },
    ], 2, 2, 1)).toThrow("Joueur invalide");
  });

  it("refuse les configurations de manche invalides", () => {
    const valid: DiceThrow[] = [{ playerIndex: 0, dice: [2, 3], total: 5, isMillion: false }];
    expect(() => evaluateThrows(valid, 1, 2, 1)).toThrow("Nombre de joueurs invalide");
    expect(() => evaluateThrows(valid, 2, 1, 1)).toThrow("Nombre de dés invalide");
    expect(() => evaluateThrows(valid, 2, 2, 7)).toThrow("Chiffre du Million invalide");
  });

  it("rejette plus de lancers que de joueurs", () => {
    const tooMany: DiceThrow[] = [
      { playerIndex: 0, dice: [2, 3], total: 5, isMillion: false },
      { playerIndex: 1, dice: [4, 5], total: 9, isMillion: false },
      { playerIndex: 2, dice: [1, 2], total: 3, isMillion: false },
    ];
    expect(() => evaluateThrows(tooMany, 2, 2, 1)).toThrow("Trop de lancers");
  });

  it("rejette les totaux ou les annonces de Million falsifiés", () => {
    expect(() => evaluateThrows([
      { playerIndex: 0, dice: [6, 6], total: 10, isMillion: false },
    ], 2, 2, 1)).toThrow();
    expect(() => evaluateThrows([
      { playerIndex: 0, dice: [1, 1], total: 2, isMillion: false },
    ], 2, 2, 1)).toThrow();
  });
});
