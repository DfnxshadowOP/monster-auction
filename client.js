const socket = io();
const $ = id => document.getElementById(id);
let state = null;
let myId = null;
let toastTimer;
socket.on('connect', () => { myId = socket.id; });
socket.on('joined', ({ code }) => { $('lobby').classList.add('hidden'); $('game').classList.remove('hidden'); $('roomCodeLabel').textContent = code; });
socket.on('notice', message => { $('lobbyNotice').textContent = message; showToast(message); });
socket.on('state', next => { state = next; render(); });
$('createBtn').onclick = () => { $('lobbyNotice').textContent = ''; socket.emit('createRoom', { name: $('playerName').value }); };
$('joinBtn').onclick = () => { $('lobbyNotice').textContent = ''; socket.emit('joinRoom', { name: $('playerName').value, code: $('roomCode').value }); };
$('startBtn').onclick = () => socket.emit('startAuction');
$('bidBtn').onclick = placeBid;
$('bidAmount').addEventListener('keydown', e => { if (e.key === 'Enter') placeBid(); });
$('copyBtn').onclick = async () => { try { await navigator.clipboard.writeText(state.code); showToast('Room code copied!'); } catch { showToast(`Room code: ${state.code}`); } };
function placeBid() {
  const amount = Number($('bidAmount').value);
  if (!Number.isSafeInteger(amount) || amount <= 0) return showToast('Enter a valid whole-number bid.');
  socket.emit('bid', { amount }); $('bidAmount').value = '';
}
function showToast(message) { const t = $('toast'); t.textContent = message; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }
function render() {
  if (!state) return;
  $('roomCodeLabel').textContent = state.code;
  $('roundNumber').textContent = state.round;
  $('roundTotal').textContent = ` / ${state.maxRounds || 10}`;
  $('playerCount').textContent = `${state.players.length}/8`;
  $('gameMessage').textContent = state.message || '';
  const isHost = state.hostId === myId;
  $('startBtn').classList.toggle('hidden', !(isHost && state.status === 'lobby'));
  $('bidBtn').disabled = state.status !== 'live';
  $('bidAmount').disabled = state.status !== 'live';
  $('auctionStatus').textContent = ({lobby:'WAITING',live:'LIVE BIDDING',break:'NEXT POKÉMON',complete:'COMPLETE'})[state.status] || state.status.toUpperCase();
  $('timer').textContent = state.status === 'live' ? `${state.secondsLeft}s` : state.status === 'break' ? `${state.breakSecondsLeft}s` : '--';
  $('timer').classList.toggle('urgent', state.status === 'live' && state.secondsLeft <= 5);
  if (state.auction) {
    const p = state.auction.pokemon;
    $('pokemonName').textContent = p.name;
    $('pokemonType').textContent = `${p.type} type · Starting bid ${p.base.toLocaleString()} coins`;
    $('pokemonRarity').textContent = p.rarity;
    $('pokemonRarity').className = `rarity ${p.rarity.toLowerCase()}`;
    $('pokemonArt').innerHTML = `<div class="art-glow"></div><img class="pokemon-image" alt="${escapeHtml(p.name)}" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.id}.png" onerror="this.outerHTML='<div class=\'orb revealed\'>${rarityEmoji(p.rarity)}</div>'">`;
    $('highestBid').innerHTML = `${state.auction.highestBid.toLocaleString()} <small>COINS</small>`;
    $('highestBidder').textContent = state.auction.highestBidderName ? `Leading: ${state.auction.highestBidderName}` : 'No bids yet';
    const minimum = state.auction.highestBid ? state.auction.highestBid + 100 : p.base;
    $('bidAmount').placeholder = `Min. ${minimum.toLocaleString()}`;
    $('bidAmount').min = minimum;
    $('bidAmount').step = 100;
  } else {
    $('pokemonName').textContent = state.status === 'complete' ? 'Auction complete!' : 'Waiting for players';
    $('pokemonType').textContent = state.status === 'complete' ? 'Your collection is ready for the final leaderboard.' : 'The host can start when 2 players have joined.';
    $('pokemonRarity').textContent = '—'; $('pokemonRarity').className = 'rarity'; $('pokemonArt').innerHTML = '<div class="orb">?</div>';
    $('highestBid').innerHTML = '0 <small>COINS</small>'; $('highestBidder').textContent = 'No bids yet';
  }
  $('playersList').innerHTML = state.players.map(p => `<div class="player-row"><div class="avatar">${escapeHtml(p.name.slice(0,1).toUpperCase())}</div><div class="player-name">${escapeHtml(p.name)} ${p.id === myId ? '<span class="you">YOU</span>' : ''} ${p.id === state.hostId ? '<span class="you">HOST</span>' : ''}</div><div class="player-coins">${p.coins.toLocaleString()} ◈</div></div>`).join('');
  const me = state.players.find(p => p.id === myId);
  $('collectionList').innerHTML = me && me.collection.length ? me.collection.map(p => `<div class="collection-item"><span>${escapeHtml(p.name)} <small>· ${escapeHtml(p.rarity)}</small></span><span>${p.paid.toLocaleString()} ◈</span></div>`).join('') : '<p class="muted">Win your first auction to add a Pokémon here.</p>';
  $('historyList').innerHTML = state.history && state.history.length ? state.history.map(item => `<div class="history-item"><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.rarity)}</small></span><span class="${item.result === 'SOLD' ? 'sold' : 'unsold'}">${item.result === 'SOLD' ? `${escapeHtml(item.winner)} · ${item.price.toLocaleString()} ◈` : 'UNSOLD'}</span></div>`).join('') : '<p class="muted">Auction results will appear here.</p>';
  $('autoNote').textContent = state.status === 'break' ? `Next Pokémon in ${state.breakSecondsLeft}s · Automatically continuing` : state.status === 'complete' ? 'All 10 rounds finished.' : 'Automatic rounds · 5-second break · Unsold Pokémon skip automatically';
}
function rarityEmoji(rarity) { return ({Common:'⭐',Rare:'✨',Epic:'💎',Legendary:'👑'})[rarity] || '⚡'; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// PWA install prompt (supported browsers only; iOS users can use Share > Add to Home Screen).
let deferredInstallPrompt = null;
const installButton = $('installBtn');
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.classList.remove('hidden');
});
installButton?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return showToast('Use your browser menu and choose Add to Home Screen.');
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.classList.add('hidden');
});
window.addEventListener('appinstalled', () => {
  installButton.classList.add('hidden');
  showToast('Monster Auction installed!');
});
