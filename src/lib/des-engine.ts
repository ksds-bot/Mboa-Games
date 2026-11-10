export type DiceConfig = {
  diceCount: number;
  playerCount: number;
  millionFace: number;
};

export type DiceThrow = {
  playerIndex: number;
  dice: number[];
  total: number;
  isMillion: boolean;
};

export type RoundResult = {
  winnerIndex: number | null;
  throws: DiceThrow[];
  contenders: number[];
  tied: boolean;
  million: boolean;
};

export function validateDiceConfig(config: DiceConfig): void {
  if (!Number.isInteger(config.diceCount) || config.diceCount < 2 || config.diceCount > 4) {
    throw new Error("Choisis entre 2 et 4 dés.");
  }
  if (!Number.isInteger(config.playerCount) || config.playerCount < 2 || config.playerCount > 10) {
    throw new Error("Choisis entre 2 et 10 joueurs.");
  }
  if (!Number.isInteger(config.millionFace) || config.millionFace < 1 || config.millionFace > 6) {
    throw new Error("Le chiffre du Million doit être compris entre 1 et 6.");
  }
}

export function evaluateThrows(
  throws: DiceThrow[],
  playerCount: number,
  diceCount: number,
  millionFace: number,
): RoundResult {
  if (throws.length === 0) throw new Error("Aucun lancer à comparer.");
  const seen = new Set<number>();
  for (const item of throws) {
    if (!Number.isInteger(item.playerIndex) || item.playerIndex < 0 || item.playerIndex >= playerCount || seen.has(item.playerIndex)) {
      throw new Error("Joueur invalide ou lancé en double.");
    }
    if (item.dice.length !== diceCount || item.dice.some((face) => !Number.isInteger(face) || face < 1 || face > 6)) {
      throw new Error("Résultat de dés invalide.");
    }
    if (item.total !== item.dice.reduce((sum, face) => sum + face, 0)) {
      throw new Error("Le total ne correspond pas aux dés.");
    }
    const expectedMillion = item.dice.every((face) => face === millionFace);
    if (item.isMillion !== expectedMillion) throw new Error("Annonce de Million invalide.");
    seen.add(item.playerIndex);
  }

  const millionThrows = throws.filter((item) => item.isMillion);
  if (millionThrows.length > 0) {
    return {
      winnerIndex: millionThrows.length === 1 ? millionThrows[0].playerIndex : null,
      throws,
      contenders: millionThrows.map((item) => item.playerIndex),
      tied: millionThrows.length > 1,
      million: true,
    };
  }

  const best = Math.max(...throws.map((item) => item.total));
  const contenders = throws.filter((item) => item.total === best).map((item) => item.playerIndex);
  return {
    winnerIndex: contenders.length === 1 ? contenders[0] : null,
    throws,
    contenders,
    tied: contenders.length > 1,
    million: false,
  };
}

export function nextRoundPlayers(result: RoundResult): number[] {
  if (result.winnerIndex !== null) return [];
  return [...result.contenders];
}

export function formatDice(dice: number[]): string {
  return dice.join(" · ");
}
