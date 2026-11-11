import { describe, expect, it } from "vitest";
import {
  announceCheck,
  canPlayCard,
  createDeck,
  createGame,
  drawCard,
  finishTurn,
  getPlayerView,
  playCard,
  RuleError,
  type Card,
  type GameState,
} from "./check-engine";

const card = (suit: Card["suit"], rank: Card["rank"]): Card => ({
  id: `${suit}-${rank}`,
  suit,
  rank,
});

function fixture(
  hands: Card[][],
  top = card("hearts", "5"),
  extras: Partial<GameState> = {},
): GameState {
  const players = hands.map((hand, index) => ({
    id: `p${index + 1}`,
    name: `Joueur ${index + 1}`,
    hand,
  }));
  return {
    players,
    drawPile: [card("clubs", "3"), card("spades", "4"), card("diamonds", "6")],
    discardPile: [top],
    currentPlayerIndex: 0,
    direction: 1,
    pendingDraw: 0,
    chosenSuit: null,
    skipNext: false,
    checkRequiredFor: null,
    status: "playing",
    winnerId: null,
    turnNumber: 1,
    lastAction: "",
    ...extras,
  };
}

describe("paquet et mise en place", () => {
  it("crée exactement 52 cartes uniques sans jokers", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((item) => item.id)).size).toBe(52);
  });

  it("distribue 7 cartes à 2 joueurs et 6 à 3 ou 4 joueurs", () => {
    const randomIndex = () => 0;
    const two = createGame({ players: [{ id: "a", name: "A" }, { id: "b", name: "B" }], randomIndex });
    expect(two.players.map((p) => p.hand.length)).toEqual([7, 7]);
    expect(two.currentPlayerIndex).toBe(1);
    expect(["A", "2", "8", "J"]).not.toContain(two.discardPile[0].rank);
    expect(two.drawPile).toHaveLength(37);

    const three = createGame({
      players: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
      randomIndex,
    });
    expect(three.players.map((p) => p.hand.length)).toEqual([6, 6, 6]);

    const four = createGame({
      players: [1, 2, 3, 4].map((n) => ({ id: String(n), name: String(n) })),
      randomIndex,
    });
    expect(four.players.map((p) => p.hand.length)).toEqual([6, 6, 6, 6]);
    expect(four.drawPile).toHaveLength(27);
  });

  it("refuse moins de 2 joueurs, plus de 4 joueurs et les identifiants dupliqués", () => {
    expect(() => createGame({ players: [{ id: "a", name: "A" }] })).toThrow(RuleError);
    expect(() => createGame({
      players: [1, 2, 3, 4, 5].map((n) => ({ id: String(n), name: String(n) })),
    })).toThrow(RuleError);
    expect(() => createGame({
      players: [{ id: "a", name: "A" }, { id: "a", name: "B" }],
    })).toThrow(RuleError);
  });
});

describe("règles de pose", () => {
  it("accepte la même couleur ou la même valeur et refuse une carte incompatible", () => {
    const state = fixture([[card("hearts", "9"), card("clubs", "5"), card("spades", "K")]]);
    expect(canPlayCard(state, state.players[0].hand[0])).toBe(true);
    expect(canPlayCard(state, state.players[0].hand[1])).toBe(true);
    expect(canPlayCard(state, state.players[0].hand[2])).toBe(false);
    expect(() => playCard(state, "p1", "spades-K")).toThrow(RuleError);
  });

  it("refuse un coup d'un joueur qui n'a pas la main", () => {
    const state = fixture([[card("hearts", "5")], [card("clubs", "3")]]);
    expect(() => playCard(state, "p2", "clubs-3")).toThrow("Ce n'est pas ton tour");
  });

  it("As : peut être posé sur toute carte, exige une couleur et la rend active", () => {
    const state = fixture([[card("spades", "A"), card("clubs", "4")]]);
    expect(() => playCard(state, "p1", "spades-A")).toThrow("Choisis une couleur");
    const played = playCard(state, "p1", "spades-A", "diamonds");
    expect(played.chosenSuit).toBe("diamonds");
    expect(played.currentPlayerIndex).toBe(0);
    expect(canPlayCard(played, card("diamonds", "3"))).toBe(true);
    expect(canPlayCard(played, card("clubs", "3"))).toBe(false);
  });

  it("As ne peut pas interrompre une pénalité de 2", () => {
    const state = fixture([[card("spades", "A")], [card("clubs", "2")]], card("hearts", "2"), {
      pendingDraw: 2,
    });
    expect(() => playCard(state, "p1", "spades-A", "clubs")).toThrow(RuleError);
  });

  it("2 : ajoute deux cartes à la pénalité; seul un autre 2 peut répondre", () => {
    const state = fixture([[card("clubs", "2"), card("hearts", "7")], [card("spades", "2")], [card("diamonds", "4")]], card("hearts", "2"), {
      pendingDraw: 2,
    });
    expect(canPlayCard(state, state.players[0].hand[0])).toBe(true);
    expect(canPlayCard(state, state.players[0].hand[1])).toBe(false);
    const stacked = playCard(state, "p1", "clubs-2");
    expect(stacked.pendingDraw).toBe(4);
    expect(stacked.currentPlayerIndex).toBe(0);
  });

  it("le joueur sans 2 pioche le cumul et son tour passe", () => {
    const state = fixture([[card("clubs", "4")], [card("diamonds", "5")]], card("hearts", "2"), {
      drawPile: [
        card("clubs", "3"),
        card("spades", "4"),
        card("diamonds", "6"),
        card("spades", "9"),
      ],
      pendingDraw: 4,
    });
    const next = drawCard(state, "p1", () => 0);
    expect(next.players[0].hand).toHaveLength(5);
    expect(next.pendingDraw).toBe(0);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it("8 fait passer le joueur suivant; à deux joueurs, le poseur rejoue", () => {
    const two = fixture([[card("hearts", "8"), card("clubs", "4"), card("spades", "9")], [card("diamonds", "3")]]);
    const playedTwo = playCard(two, "p1", "hearts-8");
    expect(finishTurn(playedTwo, "p1").currentPlayerIndex).toBe(0);

    const three = fixture([[card("hearts", "8"), card("clubs", "4"), card("spades", "9")], [card("diamonds", "3")], [card("spades", "6")]]);
    const playedThree = playCard(three, "p1", "hearts-8");
    expect(finishTurn(playedThree, "p1").currentPlayerIndex).toBe(2);
  });

  it("Valet inverse le sens; à deux joueurs, il fait rejouer le poseur", () => {
    const three = fixture([[card("hearts", "J"), card("clubs", "4"), card("spades", "9")], [card("diamonds", "3")], [card("spades", "6")]]);
    const reversed = playCard(three, "p1", "hearts-J");
    expect(reversed.direction).toBe(-1);
    expect(finishTurn(reversed, "p1").currentPlayerIndex).toBe(2);

    const two = fixture([[card("hearts", "J"), card("clubs", "4"), card("spades", "9")], [card("diamonds", "3")]]);
    expect(finishTurn(playCard(two, "p1", "hearts-J"), "p1").currentPlayerIndex).toBe(0);
  });
});

describe("Check !, pioche et fin de partie", () => {
  it("exige Check ! après avoir posé l'avant-dernière carte", () => {
    const state = fixture([[card("hearts", "5"), card("clubs", "4")], [card("diamonds", "3")]]);
    const played = playCard(state, "p1", "hearts-5");
    expect(played.checkRequiredFor).toBe("p1");
    expect(() => playCard(played, "p1", "clubs-4")).toThrow("Annonce Check");
    const announced = announceCheck(played, "p1");
    expect(announced.checkRequiredFor).toBeNull();
    expect(finishTurn(announced, "p1").currentPlayerIndex).toBe(1);
  });

  it("fait piocher deux cartes si Check ! est oublié", () => {
    const state = fixture([[card("hearts", "5"), card("clubs", "4")], [card("diamonds", "3")]]);
    const played = playCard(state, "p1", "hearts-5");
    const finished = finishTurn(played, "p1", () => 0);
    expect(finished.players[0].hand).toHaveLength(3);
    expect(finished.currentPlayerIndex).toBe(1);
  });

  it("déclare gagnant celui qui pose sa dernière carte, même si elle est spéciale", () => {
    const state = fixture([[card("hearts", "2")], [card("diamonds", "3")]]);
    const won = playCard(state, "p1", "hearts-2");
    expect(won.status).toBe("finished");
    expect(won.winnerId).toBe("p1");
    expect(won.pendingDraw).toBe(2);
    expect(() => drawCard(won, "p2")).toThrow(RuleError);
  });

  it("interdit de piocher volontairement lorsqu'une carte est jouable", () => {
    const state = fixture([[card("hearts", "9"), card("spades", "K")]], card("hearts", "5"));
    expect(() => drawCard(state, "p1", () => 0)).toThrow("Tu as une carte jouable");
  });

  it("pioche une carte jouable et permet de la jouer immédiatement", () => {
    const state = fixture([[card("spades", "K")], [card("diamonds", "3")]], card("hearts", "5"), {
      drawPile: [card("clubs", "5"), card("spades", "4")],
    });
    const drawn = drawCard(state, "p1", () => 0);
    expect(drawn.currentPlayerIndex).toBe(0);
    expect(drawn.players[0].hand).toHaveLength(2);
    expect(canPlayCard(drawn, drawn.players[0].hand[1])).toBe(true);
  });

  it("passe automatiquement si la carte piochée n'est pas jouable", () => {
    const state = fixture([[card("spades", "K")], [card("diamonds", "3")]], card("hearts", "5"), {
      drawPile: [card("clubs", "4")],
    });
    expect(drawCard(state, "p1", () => 0).currentPlayerIndex).toBe(1);
  });

  it("recycle la défausse sauf sa carte supérieure", () => {
    const state = fixture([[card("spades", "K")], [card("diamonds", "3")]], card("hearts", "5"), {
      drawPile: [],
      discardPile: [card("clubs", "4"), card("diamonds", "8"), card("hearts", "5")],
    });
    const drawn = drawCard(state, "p1", () => 0);
    expect(drawn.discardPile).toEqual([card("hearts", "5")]);
    expect(drawn.players[0].hand).toHaveLength(2);
  });

  it("ne révèle jamais les mains adverses ni l'ordre de la pioche", () => {
    const state = fixture([[card("hearts", "5")], [card("diamonds", "3"), card("clubs", "7")]]);
    const view = getPlayerView(state, "p1");
    expect(view.yourHand).toEqual([card("hearts", "5")]);
    expect(view.players).toEqual([
      { id: "p1", name: "Joueur 1", cardCount: 1 },
      { id: "p2", name: "Joueur 2", cardCount: 2 },
    ]);
    expect("drawPile" in view).toBe(false);
    expect("hand" in view.players[1]).toBe(false);
  });
});
