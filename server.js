const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 25000, pingTimeout: 20000 });
const PORT = process.env.PORT || 3000;
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const STARTING_COINS = 10000;
const INITIAL_SECONDS = 20;
const ANTI_SNIPE_SECONDS = 10;
const BREAK_SECONDS = 5;
const MAX_ROUNDS = 15;
const BID_INCREMENT = 100;

// Game power is inspired by each Pokémon's overall strength, then scaled for this game.
// Power is deliberately never sent to clients until the final reveal.
const pokemonPool = [
[1,'Bulbasaur','Grass / Poison','Common',300,320],[2,'Ivysaur','Grass / Poison','Rare',450,405],[3,'Venusaur','Grass / Poison','Epic',900,525],
[4,'Charmander','Fire','Common',300,309],[5,'Charmeleon','Fire','Rare',500,405],[6,'Charizard','Fire / Flying','Legendary',1500,534],
[7,'Squirtle','Water','Common',300,314],[8,'Wartortle','Water','Rare',450,405],[9,'Blastoise','Water','Epic',1000,530],
[25,'Pikachu','Electric','Rare',650,320],[26,'Raichu','Electric','Epic',900,485],[39,'Jigglypuff','Normal / Fairy','Common',250,270],
[52,'Meowth','Normal','Common',250,290],[53,'Persian','Normal','Rare',500,440],[58,'Growlithe','Fire','Common',350,350],[59,'Arcanine','Fire','Epic',950,555],
[63,'Abra','Psychic','Common',350,310],[64,'Kadabra','Psychic','Rare',600,400],[65,'Alakazam','Psychic','Epic',1100,500],
[66,'Machop','Fighting','Common',300,305],[67,'Machoke','Fighting','Rare',500,405],[68,'Machamp','Fighting','Epic',900,505],
[74,'Geodude','Rock / Ground','Common',300,300],[76,'Golem','Rock / Ground','Epic',850,495],[79,'Slowpoke','Water / Psychic','Common',300,315],[80,'Slowbro','Water / Psychic','Epic',850,490],
[92,'Gastly','Ghost / Poison','Common',350,310],[93,'Haunter','Ghost / Poison','Rare',600,405],[94,'Gengar','Ghost / Poison','Epic',1100,500],
[95,'Onix','Rock / Ground','Rare',550,385],[104,'Cubone','Ground','Common',300,320],[105,'Marowak','Ground','Rare',500,425],[111,'Rhyhorn','Ground / Rock','Common',350,345],[112,'Rhydon','Ground / Rock','Epic',850,485],[113,'Chansey','Normal','Rare',650,450],
[123,'Scyther','Bug / Flying','Epic',900,500],[125,'Electabuzz','Electric','Rare',650,490],[126,'Magmar','Fire','Rare',650,490],
[130,'Gyarados','Water / Flying','Legendary',1400,540],[131,'Lapras','Water / Ice','Epic',1000,535],[133,'Eevee','Normal','Rare',600,325],
[134,'Vaporeon','Water','Epic',900,525],[135,'Jolteon','Electric','Epic',900,525],[136,'Flareon','Fire','Epic',900,525],
[143,'Snorlax','Normal','Epic',1100,540],[144,'Articuno','Ice / Flying','Legendary',1700,580],[145,'Zapdos','Electric / Flying','Legendary',1700,580],[146,'Moltres','Fire / Flying','Legendary',1700,580],
[147,'Dratini','Dragon','Rare',650,300],[148,'Dragonair','Dragon','Epic',1000,420],[149,'Dragonite','Dragon / Flying','Legendary',1600,600],
[150,'Mewtwo','Psychic','Legendary',2200,680],[151,'Mew','Psychic','Legendary',2100,600],
[152,'Chikorita','Grass','Common',300,318],[155,'Cyndaquil','Fire','Common',300,309],[158,'Totodile','Water','Common',300,314],
[157,'Typhlosion','Fire','Epic',1000,534],[160,'Feraligatr','Water','Epic',1000,530],[169,'Crobat','Poison / Flying','Epic',900,535],
[196,'Espeon','Psychic','Epic',1000,525],[197,'Umbreon','Dark','Epic',1000,525],[212,'Scizor','Bug / Steel','Epic',1100,500],
[214,'Heracross','Bug / Fighting','Epic',900,500],[229,'Houndoom','Dark / Fire','Epic',900,500],[230,'Kingdra','Water / Dragon','Epic',1100,540],
[243,'Raikou','Electric','Legendary',1700,580],[244,'Entei','Fire','Legendary',1700,580],[245,'Suicune','Water','Legendary',1700,580],
[249,'Lugia','Psychic / Flying','Legendary',2300,680],[250,'Ho-Oh','Fire / Flying','Legendary',2300,680],[251,'Celebi','Psychic / Grass','Legendary',2000,600]
].filter(p => Number.isInteger(p[0]) && !String(p[1]).startsWith('placeholder')).map(([id,name,type,rarity,base,power]) => ({id,name,type,rarity,base,power}));
const rooms = new Map();
function code() { return crypto.randomBytes(3).toString('hex').toUpperCase(); }
function shuffledPool() { const a = [...pokemonPool]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function safePokemon(p, reveal=false) { if (!p) return null; const {power,...visible}=p; return reveal ? {...visible,power} : visible; }
function publicState(room) {
 const reveal = room.status === 'complete';
 const players = [...room.players.values()].map(p => ({id:p.id,name:p.name,coins:p.coins,collection:p.collection.map(x=>safePokemon(x,reveal))}));
 const leaderboard = reveal ? [...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.collection.reduce((s,x)=>s+x.power,0),count:p.collection.length,coins:p.coins})).sort((a,b)=>b.score-a.score) : [];
 return {code:room.code,hostId:room.hostId,players,status:room.status,auction:room.auction?{...room.auction,pokemon:safePokemon(room.auction.pokemon,false)}:null,secondsLeft:room.endsAt?Math.max(0,Math.ceil((room.endsAt-Date.now())/1000)):0,breakSecondsLeft:room.nextAt?Math.max(0,Math.ceil((room.nextAt-Date.now())/1000)):0,round:room.round,maxRounds:MAX_ROUNDS,message:room.message,history:room.history,leaderboard};
}
function broadcast(room){io.to(room.code).emit('state',publicState(room));}
function stopTimers(room){if(room.clock)clearInterval(room.clock);if(room.nextTimer)clearTimeout(room.nextTimer);room.clock=null;room.nextTimer=null;}
function pickPokemon(room){ if(!room.drawPile.length) room.drawPile=shuffledPool(); const p=room.drawPile.pop(); room.used.push(p.id); return p; }
function startRound(room){
 if(room.players.size<2){room.status='lobby';room.message='Waiting for at least 2 players.';broadcast(room);return false;}
 if(room.round>=MAX_ROUNDS){finishGame(room);return false;}
 stopTimers(room); room.nextAt=null; room.round++; room.status='live'; room.message='Power is hidden! Bid wisely.';
 room.auction={pokemon:pickPokemon(room),highestBid:0,highestBidderId:null,highestBidderName:null}; room.endsAt=Date.now()+INITIAL_SECONDS*1000;
 room.clock=setInterval(()=>{if(room.status!=='live')return;if(Date.now()>=room.endsAt)settle(room);else broadcast(room);},500);
 broadcast(room);return true;
}
function finishGame(room){stopTimers(room);room.status='complete';room.endsAt=null;room.nextAt=null;room.message='Final reveal! Pokémon powers are revealed and the highest collection score wins.';broadcast(room);}
function scheduleNext(room){room.status='break';room.endsAt=null;room.nextAt=Date.now()+BREAK_SECONDS*1000;broadcast(room);room.nextTimer=setTimeout(()=>{room.nextTimer=null;if(room.round>=MAX_ROUNDS)finishGame(room);else startRound(room);},BREAK_SECONDS*1000);room.clock=setInterval(()=>{if(room.status==='break')broadcast(room);},1000);}
function settle(room){if(!room||room.status!=='live')return;if(room.clock){clearInterval(room.clock);room.clock=null;}const a=room.auction;const winner=a.highestBidderId?room.players.get(a.highestBidderId):null;
 if(winner&&winner.coins>=a.highestBid){winner.coins-=a.highestBid;winner.collection.push({...a.pokemon,paid:a.highestBid});room.message=`${winner.name} won ${a.pokemon.name}! Its power remains hidden.`;room.history.unshift({name:a.pokemon.name,rarity:a.pokemon.rarity,result:'SOLD',winner:winner.name,price:a.highestBid});}
 else {room.message=`${a.pokemon.name} went UNSOLD.`;room.history.unshift({name:a.pokemon.name,rarity:a.pokemon.rarity,result:'UNSOLD'});}
 room.history=room.history.slice(0,MAX_ROUNDS);scheduleNext(room);
}
io.on('connection',socket=>{
 socket.on('createRoom',({name}={})=>{const playerName=String(name||'Trainer').trim().slice(0,18)||'Trainer';let roomCode;do{roomCode=code();}while(rooms.has(roomCode));const room={code:roomCode,hostId:socket.id,players:new Map(),status:'lobby',auction:null,endsAt:null,nextAt:null,round:0,used:[],drawPile:shuffledPool(),history:[],message:'Waiting for friends to join.',clock:null,nextTimer:null};room.players.set(socket.id,{id:socket.id,name:playerName,coins:STARTING_COINS,collection:[]});rooms.set(roomCode,room);socket.join(roomCode);socket.data.roomCode=roomCode;socket.emit('joined',{code:roomCode});broadcast(room);});
 socket.on('joinRoom',({code:rawCode,name}={})=>{const roomCode=String(rawCode||'').trim().toUpperCase();const room=rooms.get(roomCode);if(!room)return socket.emit('notice','Room not found. Check the code.');if(room.status!=='lobby')return socket.emit('notice','This auction has already started.');if(room.players.size>=8)return socket.emit('notice','This room is full (8 players maximum).');const playerName=String(name||'Trainer').trim().slice(0,18)||'Trainer';if([...room.players.values()].some(p=>p.name.toLowerCase()===playerName.toLowerCase()))return socket.emit('notice','That player name is already taken in this room.');room.players.set(socket.id,{id:socket.id,name:playerName,coins:STARTING_COINS,collection:[]});socket.join(roomCode);socket.data.roomCode=roomCode;socket.emit('joined',{code:roomCode});room.message=`${playerName} joined the room.`;broadcast(room);});
 socket.on('startAuction',()=>{const room=rooms.get(socket.data.roomCode);if(!room||room.hostId!==socket.id||room.status!=='lobby')return;if(room.players.size<2)return socket.emit('notice','At least 2 players are needed to start.');startRound(room);});
 socket.on('bid',({amount}={})=>{const room=rooms.get(socket.data.roomCode);if(!room||room.status!=='live'||!room.auction)return;const player=room.players.get(socket.id);const bid=Number(amount);if(!player||!Number.isSafeInteger(bid)||bid<=0)return socket.emit('notice','Enter a valid bid.');if(Date.now()>=room.endsAt){settle(room);return socket.emit('notice','Bidding has closed.');}if(room.auction.highestBidderId===socket.id)return socket.emit('notice','You are already the highest bidder.');const minimum=room.auction.highestBid?room.auction.highestBid+BID_INCREMENT:room.auction.pokemon.base;if(bid<minimum)return socket.emit('notice',`Minimum next bid is ${minimum.toLocaleString()} coins.`);if(bid>player.coins)return socket.emit('notice','You do not have enough coins for that bid.');room.auction.highestBid=bid;room.auction.highestBidderId=socket.id;room.auction.highestBidderName=player.name;room.message=`${player.name} bid ${bid.toLocaleString()} coins.`;if(room.endsAt-Date.now()<=ANTI_SNIPE_SECONDS*1000)room.endsAt=Date.now()+ANTI_SNIPE_SECONDS*1000;broadcast(room);});
 socket.on('disconnect',()=>{const roomCode=socket.data.roomCode;const room=rooms.get(roomCode);if(!room)return;room.players.delete(socket.id);if(!room.players.size){stopTimers(room);rooms.delete(roomCode);return;}if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;if(room.auction&&room.auction.highestBidderId===socket.id){room.auction.highestBidderId=null;room.auction.highestBidderName=null;room.auction.highestBid=0;room.message='Highest bidder disconnected. Bidding reopened.';}else room.message='A player disconnected.';broadcast(room);});
});
server.listen(PORT,()=>console.log(`Monster Auction running on port ${PORT}`));
