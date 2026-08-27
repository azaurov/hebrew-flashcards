import { DurableObject } from "cloudflare:workers";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const DISCONNECT_GRACE_MS = 25_000;
const MIN_DECK_SIZE = 8;
const MAX_DECK_SIZE = 400;
const MAX_DURATION_S = 300;
const MIN_DURATION_S = 15;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function randomCode(len = 5) {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function randomToken() {
  return crypto.randomUUID();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/room" && request.method === "POST") {
      const code = randomCode();
      return json({ code });
    }

    if (url.pathname === "/ws") {
      const code = (url.searchParams.get("code") || "").toUpperCase().trim();
      if (!/^[A-Z0-9]{4,8}$/.test(code)) {
        return json({ error: "invalid room code" }, 400);
      }
      const stub = env.BATTLE_ROOM.getByName(code);
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};

export class BattleRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.state = null;
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get("state");
      this.state = saved || this.freshState();
    });
  }

  freshState() {
    return {
      status: "waiting", // waiting | playing | ended
      duration: 60,
      deckLabel: null,
      pendingCards: null,
      cards: null,
      startTime: null,
      endTime: null,
      winner: null,
      endReason: null,
      players: {
        host: null,
        guest: null,
      },
    };
  }

  async persist() {
    await this.ctx.storage.put("state", this.state);
  }

  publicState() {
    const pub = (slot) =>
      slot && {
        name: slot.name,
        connected: slot.connected,
        correct: slot.correct,
        wrong: slot.wrong,
      };
    return {
      type: "room_state",
      status: this.state.status,
      deckLabel: this.state.deckLabel,
      cardCount: this.state.cards ? this.state.cards.length : (this.state.pendingCards ? this.state.pendingCards.length : 0),
      duration: this.state.duration,
      startTime: this.state.startTime,
      endTime: this.state.endTime,
      winner: this.state.winner,
      endReason: this.state.endReason,
      host: pub(this.state.players.host),
      guest: pub(this.state.players.guest),
    };
  }

  send(ws, msg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch (e) {
      // socket already gone; ignore
    }
  }

  broadcast(msg) {
    const payload = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch (e) {
        // ignore dead sockets
      }
    }
  }

  broadcastRoomState() {
    this.broadcast(this.publicState());
  }

  wsRole(ws) {
    const att = ws.deserializeAttachment();
    return att && att.role;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "Player").slice(0, 24) || "Player";
    const token = url.searchParams.get("token") || null;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    const role = this.assignRole(server, name, token);
    if (!role) {
      this.send(server, { type: "error", message: "Room is full." });
      server.close(1008, "room full");
      return new Response(null, { status: 101, webSocket: client });
    }

    await this.persist();
    this.send(server, { type: "joined", role, token: this.state.players[role].token, name: this.state.players[role].name });

    // If reconnecting mid-match, resend their current card so they don't lose progress.
    const slot = this.state.players[role];
    if (this.state.status === "playing" && slot.current) {
      this.send(server, { type: "card", front: slot.current.front, size: slot.current.size, options: slot.current.options, seen: slot.seen });
    }

    this.broadcastRoomState();
    this.rescheduleAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  assignRole(ws, name, token) {
    const players = this.state.players;

    // Reclaim an existing disconnected slot via token.
    for (const role of ["host", "guest"]) {
      const slot = players[role];
      if (slot && token && slot.token === token) {
        slot.connected = true;
        slot.disconnectAt = null;
        if (name) slot.name = name;
        ws.serializeAttachment({ role });
        return role;
      }
    }

    if (!players.host) {
      players.host = this.newSlot(name);
      ws.serializeAttachment({ role: "host" });
      return "host";
    }
    if (!players.guest) {
      players.guest = this.newSlot(name);
      ws.serializeAttachment({ role: "guest" });
      return "guest";
    }
    return null;
  }

  newSlot(name) {
    return {
      name,
      connected: true,
      token: randomToken(),
      disconnectAt: null,
      correct: 0,
      wrong: 0,
      seen: 0,
      order: [],
      cursor: 0,
      current: null, // {front, size, options, correctIndex}
    };
  }

  otherRole(role) {
    return role === "host" ? "guest" : "host";
  }

  async webSocketMessage(ws, raw) {
    const role = this.wsRole(ws);
    if (!role) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case "select_deck":
        this.handleSelectDeck(role, msg);
        break;
      case "start":
        this.handleStart(role, msg);
        break;
      case "answer":
        this.handleAnswer(role, msg);
        break;
      case "rematch":
        this.handleRematch(role);
        break;
      default:
        return;
    }
    await this.persist();
  }

  handleSelectDeck(role, msg) {
    if (role !== "host" || this.state.status !== "waiting") return;
    const cards = this.sanitizeCards(msg.cards);
    if (!cards || cards.length < MIN_DECK_SIZE) {
      this.send(this.wsForRole(role), { type: "error", message: `Deck needs at least ${MIN_DECK_SIZE} cards.` });
      return;
    }
    this.state.pendingCards = cards;
    this.state.deckLabel = String(msg.deckLabel || "Deck").slice(0, 60);
    this.broadcastRoomState();
  }

  sanitizeCards(cards) {
    if (!Array.isArray(cards)) return null;
    const clean = [];
    const seen = new Set();
    for (const c of cards.slice(0, MAX_DECK_SIZE)) {
      if (!c || typeof c.front !== "string" || typeof c.mean !== "string") continue;
      const front = c.front.slice(0, 80);
      const mean = c.mean.slice(0, 120);
      const translit = typeof c.translit === "string" ? c.translit.slice(0, 80) : "";
      const size = typeof c.size === "string" ? c.size.slice(0, 10) : "md";
      const key = front + "|" + mean;
      if (seen.has(key)) continue;
      seen.add(key);
      clean.push({ front, mean, translit, size });
    }
    return clean;
  }

  handleStart(role, msg) {
    if (role !== "host" || this.state.status !== "waiting") return;
    const host = this.state.players.host;
    const guest = this.state.players.guest;
    if (!host || !guest || !host.connected || !guest.connected) {
      this.send(this.wsForRole(role), { type: "error", message: "Waiting for a second player to join." });
      return;
    }
    const cards = this.state.pendingCards;
    if (!cards || cards.length < MIN_DECK_SIZE) {
      this.send(this.wsForRole(role), { type: "error", message: "Pick a deck first." });
      return;
    }
    const uniqueMeans = new Set(cards.map((c) => c.mean)).size;
    if (uniqueMeans < 4) {
      this.send(this.wsForRole(role), { type: "error", message: "Deck needs more variety for multiple choice." });
      return;
    }

    let duration = Number(msg.duration) || 60;
    duration = Math.max(MIN_DURATION_S, Math.min(MAX_DURATION_S, Math.round(duration)));

    this.state.cards = cards;
    this.state.pendingCards = null;
    this.state.duration = duration;
    this.state.status = "playing";
    this.state.startTime = Date.now();
    this.state.endTime = this.state.startTime + duration * 1000;
    this.state.winner = null;
    this.state.endReason = null;

    for (const r of ["host", "guest"]) {
      const slot = this.state.players[r];
      slot.correct = 0;
      slot.wrong = 0;
      slot.seen = 0;
      slot.order = this.shuffledIndices(cards.length);
      slot.cursor = 0;
      slot.current = null;
      this.dealNextCard(slot);
    }

    this.broadcast({
      type: "match_start",
      deckLabel: this.state.deckLabel,
      duration,
      endTime: this.state.endTime,
      totalCards: cards.length,
    });

    for (const r of ["host", "guest"]) {
      const slot = this.state.players[r];
      const ws = this.wsForRole(r);
      if (ws) this.send(ws, { type: "card", front: slot.current.front, size: slot.current.size, options: slot.current.options, seen: slot.seen });
    }

    this.broadcastRoomState();
    this.rescheduleAlarm();
  }

  shuffledIndices(n) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  dealNextCard(slot) {
    const cards = this.state.cards;
    if (slot.cursor >= slot.order.length) {
      slot.order = this.shuffledIndices(cards.length);
      slot.cursor = 0;
    }
    const idx = slot.order[slot.cursor];
    slot.cursor++;
    const card = cards[idx];
    const options = this.buildOptions(cards, idx);
    slot.current = {
      front: card.front,
      size: card.size,
      translit: card.translit,
      options: options.texts,
      correctIndex: options.correctIndex,
    };
  }

  buildOptions(cards, correctIdx) {
    const correct = cards[correctIdx].mean;
    const pool = [];
    const seen = new Set([correct]);
    const indices = this.shuffledIndices(cards.length);
    for (const i of indices) {
      if (pool.length >= 3) break;
      const m = cards[i].mean;
      if (seen.has(m)) continue;
      seen.add(m);
      pool.push(m);
    }
    const texts = [correct, ...pool];
    // pad if deck lacks enough unique distractors (shouldn't happen given MIN_DECK_SIZE/uniqueMeans checks)
    while (texts.length < 4) texts.push(pool[0] || correct);
    const order = this.shuffledIndices(texts.length);
    const shuffled = order.map((i) => texts[i]);
    const correctIndex = order.indexOf(0);
    return { texts: shuffled, correctIndex };
  }

  handleAnswer(role, msg) {
    if (this.state.status !== "playing") return;
    const slot = this.state.players[role];
    if (!slot || !slot.current) return;
    const choice = Number(msg.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= slot.current.options.length) return;

    const wasCorrect = choice === slot.current.correctIndex;
    if (wasCorrect) slot.correct++;
    else slot.wrong++;
    slot.seen++;

    this.dealNextCard(slot);
    const ws = this.wsForRole(role);
    if (ws) this.send(ws, { type: "card", front: slot.current.front, size: slot.current.size, options: slot.current.options, seen: slot.seen, lastCorrect: wasCorrect });
    this.broadcastRoomState();
  }

  handleRematch(role) {
    if (role !== "host" || this.state.status !== "ended") return;
    const players = this.state.players;
    this.state = this.freshState();
    this.state.players = players;
    for (const r of ["host", "guest"]) {
      const slot = this.state.players[r];
      if (slot) {
        slot.correct = 0;
        slot.wrong = 0;
        slot.seen = 0;
        slot.order = [];
        slot.cursor = 0;
        slot.current = null;
      }
    }
    this.broadcastRoomState();
  }

  wsForRole(role) {
    for (const ws of this.ctx.getWebSockets()) {
      if (this.wsRole(ws) === role) return ws;
    }
    return null;
  }

  async webSocketClose(ws) {
    await this.markDisconnected(ws);
  }

  async webSocketError(ws) {
    await this.markDisconnected(ws);
  }

  async markDisconnected(ws) {
    const role = this.wsRole(ws);
    if (!role) return;
    const slot = this.state.players[role];
    if (!slot) return;
    slot.connected = false;
    slot.disconnectAt = Date.now() + DISCONNECT_GRACE_MS;
    await this.persist();
    this.broadcastRoomState();
    this.rescheduleAlarm();
  }

  async rescheduleAlarm() {
    const deadlines = [];
    if (this.state.status === "playing" && this.state.endTime) deadlines.push(this.state.endTime);
    if (this.state.status === "playing") {
      for (const r of ["host", "guest"]) {
        const slot = this.state.players[r];
        if (slot && !slot.connected && slot.disconnectAt) deadlines.push(slot.disconnectAt);
      }
    }
    if (deadlines.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.min(...deadlines));
  }

  async alarm() {
    if (this.state.status !== "playing") return;
    const now = Date.now();

    if (this.state.endTime && now >= this.state.endTime) {
      this.finishMatch("time_up");
      await this.persist();
      return;
    }

    for (const r of ["host", "guest"]) {
      const slot = this.state.players[r];
      if (slot && !slot.connected && slot.disconnectAt && now >= slot.disconnectAt) {
        this.finishMatch("forfeit", this.otherRole(r));
        await this.persist();
        return;
      }
    }

    // Deadline moved (e.g. reconnect happened) — recompute.
    await this.rescheduleAlarm();
  }

  finishMatch(reason, forcedWinner) {
    const host = this.state.players.host;
    const guest = this.state.players.guest;
    let winner = forcedWinner || null;
    if (!winner) {
      if (host.correct > guest.correct) winner = "host";
      else if (guest.correct > host.correct) winner = "guest";
      else winner = "tie";
    }
    this.state.status = "ended";
    this.state.endReason = reason;
    this.state.winner = winner;
    this.broadcast({
      type: "game_over",
      reason,
      winner,
      host: { name: host.name, correct: host.correct, wrong: host.wrong },
      guest: { name: guest.name, correct: guest.correct, wrong: guest.wrong },
    });
    this.broadcastRoomState();
    this.ctx.storage.deleteAlarm();
  }
}
