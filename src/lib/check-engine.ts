
export const SUITS = ["hearts", "diamonds", "clubs", "spades"] as const;
export type Suit = (typeof SUITS)[number];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  readonly id: string;
  readonly suit: Suit;
  readonly rank: Rank;
}

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly hand: Card[];
}

export type GameStatus = "playing" | "finished";

export interface GameState {
  readonly players: Player[];
  readonly drawPile: Card[];
  readonly discardPile: Card[];
  readonly currentPlayerIndex: number;
  readonly direction: 1 | -1;
  readonly pendingDraw: number;
  readonly chosenSuit: Suit | null;
  readonly skipNext: boolean;
  readonly checkRequiredFor: string | null;
  readonly status: GameStatus;
  readonly winnerId: string | null;
  readonly turnNumber: number;
  readonly lastAction: string;
}

export interface CreateGameOptions {
  players: Array<{ id: string; name: string }>;
  /** Dealer's index. The player immediately to their left starts. Defaults to 0. */
  dealerIndex?: number;
  /** Test seam only. Production uses node:crypto randomInt. */
  randomIndex?: (exclusiveMax: number) => number;
}

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

const secureRandomIndex = (exclusiveMax: number): number => {
  if (!Number.isInteger(exclusiveMax) || exclusiveMax <= 0) {
    throw new RangeError("La borne aléatoire doit être un entier positif.");
  }
  // Web Crypto fonctionne dans le navigateur et dans Node.js récent.
  const range = 0x1_0000_0000;
  const limit = range - (range % exclusiveMax);
  const value = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % exclusiveMax;
};

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({ id: `${suit}-${rank}`, suit, rank })),
  );
}

export function shuffle<T>(
  items: readonly T[],
  randomIndex: (exclusiveMax: number) => number = secureRandomIndex,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) {
      throw new RangeError("Le générateur aléatoire a renvoyé un index invalide.");
    }
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const nextIndex = (index: number, direction: 1 | -1, count: number, steps = 1) =>
  (index + direction * steps + count * 2) % count;

function refillDrawPile(state: GameState, randomIndex: (max: number) => number): GameState {
  if (state.drawPile.length > 0 || state.discardPile.length <= 1) return state;
  const top = state.discardPile[state.discardPile.length - 1];
  const recycled = state.discardPile.slice(0, -1);
  return {
    ...state,
    drawPile: shuffle(recycled, randomIndex),
    discardPile: [top],
  };
}

function drawFromPile(
  state: GameState,
  count: number,
  randomIndex: (max: number) => number,
): { state: GameState; cards: Card[] } {
  let next = state;
  const cards: Card[] = [];
  for (let i = 0; i < count; i += 1) {
    next = refillDrawPile(next, randomIndex);
    if (next.drawPile.length === 0) break;
    const card = next.drawPile[0];
    cards.push(card);
    next = { ...next, drawPile: next.drawPile.slice(1) };
  }
  return { state: next, cards };
}

function isPlayable(card: Card, top: Card, chosenSuit: Suit | null, pendingDraw: number): boolean {
  if (pendingDraw > 0) return card.rank === "2";
  if (card.rank === "A") return true;
  return card.suit === (chosenSuit ?? top.suit) || card.rank === top.rank;
}

function requireCurrentPlayer(state: GameState, playerId: string): Player {
  if (state.status !== "playing") throw new RuleError("La partie est déjà terminée.");
  const player = state.players[state.currentPlayerIndex];
  if (!player || player.id !== playerId) throw new RuleError("Ce n'est pas ton tour.");
  if (state.checkRequiredFor) throw new RuleError("Annonce Check ! ou termine d'abord ton tour.");
  return player;
}

function advance(state: GameState, skip = false): GameState {
  return {
    ...state,
    currentPlayerIndex: nextIndex(
      state.currentPlayerIndex,
      state.direction,
      state.players.length,
      skip ? 2 : 1,
    ),
    skipNext: false,
    turnNumber: state.turnNumber + 1,
  };
}

export function createGame(options: CreateGameOptions): GameState {
  const { players, dealerIndex = 0, randomIndex = secureRandomIndex } = options;
  if (players.length < 2 || players.length > 4) {
    throw new RuleError("Check! se joue de 2 à 4 joueurs.");
  }
  if (new Set(players.map((player) => player.id)).size !== players.length) {
    throw new RuleError("Chaque joueur doit avoir un identifiant unique.");
  }
  if (players.some((player) => !player.id.trim() || !player.name.trim())) {
    throw new RuleError("Chaque joueur doit avoir un identifiant et un pseudo.");
  }
  if (!Number.isInteger(dealerIndex) || dealerIndex < 0 || dealerIndex >= players.length) {
    throw new RuleError("Le donneur indiqué est invalide.");
  }

  const deck = shuffle(createDeck(), randomIndex);
  const handSize = players.length === 2 ? 7 : 6;
  const dealt: Player[] = players.map((player) => ({ ...player, hand: [] }));
  let cursor = 0;

  for (let round = 0; round < handSize; round += 1) {
    for (let offset = 0; offset < players.length; offset += 1) {
      dealt[(dealerIndex + 1 + offset) % players.length].hand.push(deck[cursor++]);
    }
  }

  // Une carte spéciale révélée au départ retourne sous la pioche.
  const drawPile = deck.slice(cursor);
  let firstDiscard = drawPile.shift();
  while (firstDiscard && ["A", "2", "8", "J"].includes(firstDiscard.rank)) {
    // La carte spéciale est replacée sous la pioche, puis on retourne la suivante.
    drawPile.push(firstDiscard);
    firstDiscard = drawPile.shift();
  }
  if (!firstDiscard) throw new RuleError("Impossible de préparer la défausse.");

  return {
    players: dealt,
    drawPile,
    discardPile: [firstDiscard],
    currentPlayerIndex: (dealerIndex + 1) % players.length,
    direction: 1,
    pendingDraw: 0,
    chosenSuit: null,
    skipNext: false,
    checkRequiredFor: null,
    status: "playing",
    winnerId: null,
    turnNumber: 1,
    lastAction: "La partie commence.",
  };
}

export function canPlayCard(state: GameState, card: Card): boolean {
  const top = state.discardPile[state.discardPile.length - 1];
  return Boolean(top && isPlayable(card, top, state.chosenSuit, state.pendingDraw));
}

export function playCard(
  state: GameState,
  playerId: string,
  cardId: string,
  chosenSuit?: Suit,
): GameState {
  const player = requireCurrentPlayer(state, playerId);
  const card = player.hand.find((candidate) => candidate.id === cardId);
  if (!card) throw new RuleError("Cette carte ne se trouve pas dans ta main.");

  const top = state.discardPile[state.discardPile.length - 1];
  if (!top || !isPlayable(card, top, state.chosenSuit, state.pendingDraw)) {
    throw new RuleError("Carte invalide : elle doit suivre la couleur ou la valeur.");
  }
  if (card.rank === "A" && !chosenSuit) {
    throw new RuleError("Choisis une couleur après avoir posé un As.");
  }
  if (card.rank !== "A" && chosenSuit) {
    throw new RuleError("On ne choisit une couleur qu'avec un As.");
  }

  const players = state.players.map((candidate) =>
    candidate.id === playerId
      ? { ...candidate, hand: candidate.hand.filter((held) => held.id !== cardId) }
      : candidate,
  );
  let next: GameState = {
    ...state,
    players,
    discardPile: [...state.discardPile, card],
    chosenSuit: card.rank === "A" ? chosenSuit! : null,
    pendingDraw: card.rank === "2" ? state.pendingDraw + 2 : 0,
    skipNext: card.rank === "8" || (card.rank === "J" && players.length === 2),
    direction: card.rank === "J" && players.length > 2
      ? (state.direction === 1 ? -1 : 1)
      : state.direction,
    lastAction: `${player.name} a posé ${card.rank} de ${card.suit}.`,
  };

  if (players[state.currentPlayerIndex].hand.length === 0) {
    return { ...next, status: "finished", winnerId: playerId, checkRequiredFor: null };
  }

  if (players[state.currentPlayerIndex].hand.length === 1) {
    next = { ...next, checkRequiredFor: playerId };
  }
  return next;
}

export function announceCheck(state: GameState, playerId: string): GameState {
  if (state.status !== "playing" || state.checkRequiredFor !== playerId) {
    throw new RuleError("Aucune annonce Check ! n'est attendue pour ce joueur.");
  }
  return {
    ...state,
    checkRequiredFor: null,
    lastAction: `${state.players[state.currentPlayerIndex].name} a annoncé Check !`,
  };
}

/** Termine le tour. Un Check ! oublié entraîne immédiatement deux cartes de pénalité. */
export function finishTurn(
  state: GameState,
  playerId: string,
  randomIndex: (max: number) => number = secureRandomIndex,
): GameState {
  if (state.status !== "playing") throw new RuleError("La partie est déjà terminée.");
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) throw new RuleError("Ce n'est pas ton tour.");

  let next = state;
  if (state.checkRequiredFor === playerId) {
    const drawn = drawFromPile(state, 2, randomIndex);
    next = {
      ...drawn.state,
      players: drawn.state.players.map((player) =>
        player.id === playerId ? { ...player, hand: [...player.hand, ...drawn.cards] } : player,
      ),
      checkRequiredFor: null,
      lastAction: `${current.name} a oublié Check ! et pioche 2 cartes.`,
    };
  } else if (state.checkRequiredFor) {
    throw new RuleError("Un autre joueur doit annoncer Check !.");
  }

  return advance(next, next.skipNext);
}

/**
 * Pioche une carte. Si elle n'est pas jouable, le tour passe automatiquement.
 * En cas de pénalité de 2, le joueur pioche tout le cumul et passe son tour.
 */
export function drawCard(
  state: GameState,
  playerId: string,
  randomIndex: (max: number) => number = secureRandomIndex,
): GameState {
  const player = requireCurrentPlayer(state, playerId);
  const amount = state.pendingDraw > 0 ? state.pendingDraw : 1;
  const drawn = drawFromPile(state, amount, randomIndex);
  const updatedHand = [...player.hand, ...drawn.cards];
  const players = drawn.state.players.map((candidate) =>
    candidate.id === playerId ? { ...candidate, hand: updatedHand } : candidate,
  );

  const next: GameState = {
    ...drawn.state,
    players,
    pendingDraw: 0,
    lastAction: state.pendingDraw > 0
      ? `${player.name} pioche ${drawn.cards.length} carte(s) de pénalité.`
      : drawn.cards.length
        ? `${player.name} pioche une carte.`
        : `${player.name} ne peut pas piocher : la pioche est vide.`,
  };

  if (state.pendingDraw > 0 || drawn.cards.length === 0 || !canPlayCard(next, drawn.cards[0])) {
    return advance(next);
  }
  return next;
}

export interface PlayerGameView {
  readonly players: Array<{ id: string; name: string; cardCount: number }>;
  readonly yourHand: Card[];
  readonly topDiscard: Card;
  readonly drawCount: number;
  readonly currentPlayerId: string;
  readonly direction: 1 | -1;
  readonly pendingDraw: number;
  readonly chosenSuit: Suit | null;
  readonly checkRequiredFor: string | null;
  readonly status: GameStatus;
  readonly winnerId: string | null;
  readonly turnNumber: number;
  readonly lastAction: string;
}

export function getPlayerView(state: GameState, playerId: string): PlayerGameView {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new RuleError("Joueur introuvable dans cette partie.");
  const topDiscard = state.discardPile[state.discardPile.length - 1];
  if (!topDiscard) throw new RuleError("La défausse est vide.");
  return {
    players: state.players.map(({ id, name, hand }) => ({ id, name, cardCount: hand.length })),
    yourHand: [...player.hand],
    topDiscard,
    drawCount: state.drawPile.length,
    currentPlayerId: state.players[state.currentPlayerIndex].id,
    direction: state.direction,
    pendingDraw: state.pendingDraw,
    chosenSuit: state.chosenSuit,
    checkRequiredFor: state.checkRequiredFor,
    status: state.status,
    winnerId: state.winnerId,
    turnNumber: state.turnNumber,
    lastAction: state.lastAction,
  };
}
