const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(__dirname));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
const STARTING_COINS = 10000;
const INITIAL_SECONDS = 20;
const ANTI_SNIPE_SECONDS = 10;
const BREAK_SECONDS = 5;
const MAX_ROUNDS = 10;
const BID_INCREMENT = 100;
const pokemonPool = [
  { id: 25, name: 'Pikachu', type: 'Electric', rarity: 'Rare', base: 500 },
  { id: 6, name: 'Charizard', type: 'Fire / Flying', rarity: 'Legendary', base: 1800 },
  { id: 1, name: 'Bulbasaur', type: 'Grass / Poison', rarity: 'Common', base: 300 },
  { id: 7, name: 'Squirtle', type: 'Water', rarity: 'Common', base: 300 },
  { id: 150, name: 'Mewtwo', type: 'Psychic', rarity: 'Legendary', base: 2200 },
  { id: 94, name: 'Gengar', type: 'Ghost / Poison', rarity: 'Epic', base: 1100 },
  { id: 133, name: 'Eevee', type: 'Normal', rarity: 'Rare', base: 650 },
  { id: 143, name: 'Snorlax', type: 'Normal', rarity: 'Rare', base: 700 },
  { id: 39, name: 'Jigglypuff', type: 'Fairy / Normal', rarity: 'Common', base: 250 },
  { id: 9, name: 'Blastoise', type: 'Water', rarity: 'Epic', base: 1300 },
  { id: 59, name: 'Arcanine', type: 'Fire', rarity: 'Rare', base: 800 },
  { id: 65, name: 'Alakazam', type: 'Psychic', rarity: 'Epic', base: 1200 },
  { id: 68, name: 'Machamp', type: 'Fighting', rarity: 'Rare', base: 750 }
].filter(p => Number.isInteger(p.id));
const rooms = new Map();
function code() { return crypto.randomBytes(3).toString('hex').toUpperCase(); }
function publicState(room) {
  return {
    code: room.code, hostId: room.hostId,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, coins: p.coins, collection: p.collection })),
    status: room.status, auction: room.auction,
    secondsLeft: room.endsAt ? Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000)) : 0,
    breakSecondsLeft: room.nextAt ? Math.max(0, Math.ceil((room.nextAt - Date.now()) / 1000)) : 0,
    round: room.round, maxRounds: MAX_ROUNDS, message: room.message, history: room.history
  };
}
function broadcast(room) { io.to(room.code).emit('state', publicState(room)); }
function pickPokemon(room) {
  const available = pokemonPool.filter(p => !room.used.includes(p.name));
  const pool = available.length ? available : pokemonPool;
  // Weighted rarity: common 50%, rare 30%, epic 15%, legendary 5%.
  const roll = Math.random();
  const rarity = roll < .50 ? 'Common' : roll < .80 ? 'Rare' : roll < .95 ? 'Epic' : 'Legendary';
  const preferred = pool.filter(p => p.rarity === rarity);
  const chosenPool = preferred.length ? preferred : pool;
  const pokemon = chosenPool[Math.floor(Math.random() * chosenPool.length)];
  room.used.push(pokemon.name);
  return pokemon;
}
function stopTimers(room) {
  clearInterval(room.clock); clearTimeout(room.nextTimer);
  room.clock = null; room.nextTimer = null;
}
function scheduleNext(room) {
  room.status = 'break'; room.endsAt = null; room.nextAt = Date.now() + BREAK_SECONDS * 1000;
  broadcast(room);
  room.nextTimer = setTimeout(() => {
    if (room.round >= MAX_ROUNDS) {
      room.status = 'complete'; room.nextAt = null;
      room.message = `Auction complete! All ${MAX_ROUNDS} rounds have finished.`;
      broadcast(room);
    } else startRound(room);
  }, BREAK_SECONDS * 1000);
  room.clock = setInterval(() => broadcast(room), 1000);
}
function settle(room) {
  if (!room || room.status !== 'live') return;
  clearInterval(room.clock); room.clock = null;
  const a = room.auction;
  if (a.highestBidderId) {
    const winner = room.players.get(a.highestBidderId);
    if (winner && winner.coins >= a.highestBid) {
      winner.coins -= a.highestBid;
      winner.collection.push({ id: a.pokemon.id, name: a.pokemon.name, rarity: a.pokemon.rarity, paid: a.highestBid });
      room.message = `${winner.name} won ${a.pokemon.name} for ${a.highestBid.toLocaleString()} coins!`;
      room.history.unshift({ name: a.pokemon.name, rarity: a.pokemon.rarity, result: 'SOLD', winner: winner.name, price: a.highestBid });
    } else {
      room.message = `No winner for ${a.pokemon.name}.`;
      room.history.unshift({ name: a.pokemon.name, rarity: a.pokemon.rarity, result: 'UNSOLD' });
    }
  } else {
    room.message = `No bids for ${a.pokemon.name}. It went UNSOLD.`;
    room.history.unshift({ name: a.pokemon.name, rarity: a.pokemon.rarity, result: 'UNSOLD' });
  }
  room.history = room.history.slice(0, MAX_ROUNDS);
  scheduleNext(room);
}
function startRound(room) {
  if (room.players.size < 2) { room.status = 'lobby'; room.message = 'Waiting for at least 2 players.'; return false; }
  if (room.round >= MAX_ROUNDS) { room.status = 'complete'; broadcast(room); return false; }
  clearInterval(room.clock); clearTimeout(room.nextTimer);
  room.clock = null; room.nextTimer = null; room.nextAt = null;
  room.round++; room.status = 'live'; room.message = 'Bidding is open!';
  room.auction = { pokemon: pickPokemon(room), highestBid: 0, highestBidderId: null, highestBidderName: null, minBid: 100 };
  room.endsAt = Date.now() + INITIAL_SECONDS * 1000;
  room.clock = setInterval(() => {
    if (Date.now() >= room.endsAt) settle(room);
    else broadcast(room);
  }, 1000);
  broadcast(room); return true;
}
io.on('connection', socket => {
  socket.on('createRoom', ({ name }) => {
    const playerName = String(name || 'Trainer').trim().slice(0, 18) || 'Trainer';
    let roomCode; do { roomCode = code(); } while (rooms.has(roomCode));
    const room = { code: roomCode, hostId: socket.id, players: new Map(), status: 'lobby', auction: null, endsAt: null, nextAt: null, round: 0, used: [], history: [], message: 'Waiting for friends to join.', clock: null, nextTimer: null };
    room.players.set(socket.id, { id: socket.id, name: playerName, coins: STARTING_COINS, collection: [] });
    rooms.set(roomCode, room); socket.join(roomCode); socket.data.roomCode = roomCode;
    socket.emit('joined', { code: roomCode }); broadcast(room);
  });
  socket.on('joinRoom', ({ code: rawCode, name }) => {
    const roomCode = String(rawCode || '').trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return socket.emit('notice', 'Room not found. Check the code.');
    if (room.status !== 'lobby') return socket.emit('notice', 'This auction has already started.');
    if (room.players.size >= 8) return socket.emit('notice', 'This room is full (8 players maximum).');
    const playerName = String(name || 'Trainer').trim().slice(0, 18) || 'Trainer';
    if ([...room.players.values()].some(p => p.name.toLowerCase() === playerName.toLowerCase())) return socket.emit('notice', 'That player name is already taken in this room.');
    room.players.set(socket.id, { id: socket.id, name: playerName, coins: STARTING_COINS, collection: [] });
    socket.join(roomCode); socket.data.roomCode = roomCode;
    socket.emit('joined', { code: roomCode }); room.message = `${playerName} joined the room.`; broadcast(room);
  });
  socket.on('startAuction', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.status !== 'lobby') return;
    if (room.players.size < 2) return socket.emit('notice', 'At least 2 players are needed to start.');
    startRound(room);
  });
  socket.on('bid', ({ amount }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'live') return;
    const player = room.players.get(socket.id); const bid = Number(amount);
    if (!player || !Number.isSafeInteger(bid)) return;
    if (room.auction.highestBidderId === socket.id) return socket.emit('notice', 'You are already the highest bidder.');
    const minimum = room.auction.highestBid ? room.auction.highestBid + BID_INCREMENT : room.auction.pokemon.base;
    if (bid < minimum) return socket.emit('notice', `Minimum next bid is ${minimum.toLocaleString()} coins.`);
    if (bid > player.coins) return socket.emit('notice', 'You do not have enough coins for that bid.');
    room.auction.highestBid = bid; room.auction.highestBidderId = socket.id; room.auction.highestBidderName = player.name;
    room.message = `${player.name} bid ${bid.toLocaleString()} coins.`;
    // Anti-sniping: any bid in the final 10 seconds gives everyone 10 more seconds.
    if (room.endsAt - Date.now() <= ANTI_SNIPE_SECONDS * 1000) room.endsAt = Date.now() + ANTI_SNIPE_SECONDS * 1000;
    broadcast(room);
  });
  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode; const room = rooms.get(roomCode);
    if (!room) return;
    room.players.delete(socket.id);
    if (!room.players.size) { stopTimers(room); rooms.delete(roomCode); return; }
    if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    if (room.auction && room.auction.highestBidderId === socket.id) {
      room.auction.highestBidderId = null; room.auction.highestBidderName = null; room.auction.highestBid = 0;
      room.message = 'Highest bidder disconnected. Bidding is open again.';
    } else room.message = 'A player disconnected.';
    broadcast(room);
  });
});
server.listen(PORT, () => console.log(`Monster Auction running on http://localhost:${PORT}`));
