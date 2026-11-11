export const LUDO_PLAYERS = [
  { id: "red", label: "Rouge", start: 0 },
  { id: "green", label: "Vert", start: 13 },
  { id: "yellow", label: "Jaune", start: 26 },
  { id: "blue", label: "Bleu", start: 39 },
] as const;

export const LUDO_SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export type LudoPlayerId = (typeof LUDO_PLAYERS)[number]["id"];
export type LudoToken = number; // -1 = base, 0..56 = parcours, 57 = arrivé
export type LudoState = {
  playerCount: number;
  tokens: number[][];
  currentPlayer: number;
  lastRoll: number | null;
  winner: number | null;
  consecutiveSixes: number;
};

export function createLudoGame(playerCount: number): LudoState {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 4) {
    throw new Error("Le Ludo se joue de 2 à 4 joueurs.");
  }
  return {
    playerCount,
    tokens: Array.from({ length: playerCount }, () => [-1, -1, -1, -1]),
    currentPlayer: 0,
    lastRoll: null,
    winner: null,
    consecutiveSixes: 0,
  };
}

export function globalSquare(playerIndex: number, progress: number): number | null {
  if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= 4) return null;
  if (!Number.isInteger(progress) || progress < 0 || progress > 50) return null;
  return (LUDO_PLAYERS[playerIndex].start + progress) % 52;
}

export function isSafeSquare(square: number): boolean {
  return LUDO_SAFE_SQUARES.has(square);
}

export function getLegalTokenMoves(state: LudoState, roll: number): number[] {
  if (!Number.isInteger(roll) || roll < 1 || roll > 6 || state.winner !== null) return [];
  const tokens = state.tokens[state.currentPlayer];
  if (!tokens) return [];
  return tokens.flatMap((progress, index) => {
    if (progress === 57) return [];
    if (progress === -1) return roll === 6 ? [index] : [];
    return progress + roll <= 57 ? [index] : [];
  });
}

export function rollLudo(state: LudoState, roll: number): LudoState {
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) throw new Error("Le dé doit afficher un chiffre de 1 à 6.");
  if (state.winner !== null) throw new Error("La partie est déjà terminée.");
  if (state.lastRoll !== null) throw new Error("Choisis d'abord un pion à déplacer.");
  const sixes = roll === 6 ? state.consecutiveSixes + 1 : 0;
  if (sixes >= 3) {
    return { ...state, currentPlayer: (state.currentPlayer + 1) % state.playerCount, lastRoll: null, consecutiveSixes: 0 };
  }
  const next = { ...state, lastRoll: roll, consecutiveSixes: sixes };
  if (getLegalTokenMoves(next, roll).length === 0) {
    return {
      ...next,
      currentPlayer: roll === 6 ? state.currentPlayer : (state.currentPlayer + 1) % state.playerCount,
      lastRoll: null,
      consecutiveSixes: roll === 6 ? sixes : 0,
    };
  }
  return next;
}

export function moveLudoToken(state: LudoState, tokenIndex: number): LudoState {
  const roll = state.lastRoll;
  if (roll === null) throw new Error("Lance d'abord le dé.");
  if (!getLegalTokenMoves(state, roll).includes(tokenIndex)) throw new Error("Ce pion ne peut pas avancer de cette façon.");
  const player = state.currentPlayer;
  const tokens = state.tokens.map((row) => [...row]);
  const previous = tokens[player][tokenIndex];
  const nextProgress = previous === -1 ? 0 : previous + roll;
  tokens[player][tokenIndex] = nextProgress;

  let captured = false;
  if (nextProgress <= 50) {
    const square = globalSquare(player, nextProgress);
    if (square !== null && !isSafeSquare(square)) {
      for (let opponent = 0; opponent < state.playerCount; opponent += 1) {
        if (opponent === player) continue;
        tokens[opponent] = tokens[opponent].map((progress) => {
          if (progress >= 0 && progress <= 50 && globalSquare(opponent, progress) === square) {
            captured = true;
            return -1;
          }
          return progress;
        });
      }
    }
  }

  const winner = tokens[player].every((progress) => progress === 57) ? player : null;
  const bonusTurn = roll === 6 || captured;
  return {
    ...state,
    tokens,
    winner,
    lastRoll: null,
    currentPlayer: winner !== null || bonusTurn ? player : (player + 1) % state.playerCount,
    consecutiveSixes: bonusTurn ? state.consecutiveSixes : 0,
  };
}
