const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const WORDS = require('./words');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 60000,
  pingInterval: 20000,
  connectionStateRecovery: {}
});

// Detect all local Wi-Fi / Hotspot IPv4 addresses on this device (Android or PC)
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/network', (req, res) => {
  const port = process.env.PORT || 3000;
  const ips = getLocalIPs();
  // Prefer Android hotspot subnet (192.168.43.x or 192.168.x.x)
  const primaryIp = ips.find(i => i.address.startsWith('192.168.43.'))?.address
    || ips.find(i => i.address.startsWith('192.168.'))?.address
    || ips[0]?.address
    || 'localhost';
  res.json({
    port,
    primaryUrl: `http://${primaryIp}:${port}`,
    allUrls: ips.map(i => `http://${i.address}:${port}`)
  });
});

// Active sessions stored in memory
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeWord(w) {
  return (w || '').toString().trim().toLowerCase().replace(/[^a-z0-9àèéìòù]/g, '');
}

/**
 * Assigns 3 drawings per player such that no player receives any of their own 3 drawings.
 */
function assignDrawingsDerangement(drawings, playerIds) {
  const N = playerIds.length;
  const assignments = {};
  playerIds.forEach(pid => { assignments[pid] = []; });

  const colors = ['red', 'green', 'blue'];
  const rotations = [0, 90, 180, 270];

  for (let r = 1; r <= 3; r++) {
    const roundDrawings = drawings.filter(d => d.round === r);
    let indices = playerIds.map((_, idx) => idx);
    let attempts = 0;
    while (attempts < 200) {
      indices = shuffle(indices);
      const valid = indices.every((targetIdx, idx) => playerIds[targetIdx] !== roundDrawings[idx]?.authorId);
      if (valid) break;
      attempts++;
    }
    if (!indices.every((targetIdx, idx) => playerIds[targetIdx] !== roundDrawings[idx]?.authorId)) {
      roundDrawings.sort((a, b) => playerIds.indexOf(a.authorId) - playerIds.indexOf(b.authorId));
      indices = playerIds.map((_, idx) => (idx + 1) % N);
    }

    roundDrawings.forEach((drawing, idx) => {
      const recipientId = playerIds[indices[idx]];
      assignments[recipientId].push(drawing);
    });
  }

  for (const pid of playerIds) {
    const playerColors = shuffle(colors);
    assignments[pid] = shuffle(assignments[pid]).map((d, idx) => {
      d.assignedTo = pid;
      d.color = playerColors[idx % 3];
      d.rotation = rotations[Math.floor(Math.random() * rotations.length)];
      return d;
    });
  }

  return assignments;
}

function getPublicRoomState(room, forPlayerId) {
  const players = room.players.map(p => ({
    id: p.id,
    name: p.name,
    isHost: p.id === room.hostId,
    connected: p.connected,
    roundPenalty: p.roundPenalties,
    totalPenalty: p.totalPenalty,
    guessPoints: p.guessPoints,
    artistPoints: p.artistPoints,
    totalScore: p.guessPoints + p.artistPoints - p.totalPenalty,
    hasFinishedRoundDrawing: room.state === 'DRAWING'
      ? room.drawings.some(d => d.round === room.currentRound && d.authorId === p.id)
      : false,
    hasFinishedScoring1: room.state === 'SCORING_1' ? !!room.scoring1Done[p.id] : false,
    hasFinishedScoring2: room.state === 'SCORING_2' ? !!room.scoring2Done[p.id] : false
  }));

  const me = room.players.find(p => p.id === forPlayerId);

  let myAssignedPainting = null;
  if (['SCORING_1', 'SCORING_2', 'GAME_OVER'].includes(room.state) && me) {
    const assigned = room.assignments[me.id] || [];
    myAssignedPainting = assigned.map(d => ({
      id: d.id,
      authorId: d.authorId,
      authorName: room.players.find(p => p.id === d.authorId)?.name || 'Unknown',
      strokes: d.strokes,
      rotation: d.rotation,
      color: d.color,
      guessedRound1: d.guessedRound1,
      guessedRound2: d.guessedRound2,
      guessedBy: d.guessedBy,
      word: (d.guessedRound1 || d.guessedRound2 || room.state === 'GAME_OVER') ? d.word : null,
      wordLength: d.word.length
    }));
  }

  let gallery = null;
  if (room.state === 'GAME_OVER') {
    gallery = room.players.map(p => ({
      playerId: p.id,
      playerName: p.name,
      drawings: (room.assignments[p.id] || []).map(d => ({
        id: d.id,
        authorId: d.authorId,
        authorName: room.players.find(pl => pl.id === d.authorId)?.name || 'Unknown',
        word: d.word,
        strokes: d.strokes,
        rotation: d.rotation,
        color: d.color,
        guessedRound1: d.guessedRound1,
        guessedRound2: d.guessedRound2
      }))
    }));
  }

  return {
    code: room.code,
    language: room.language,
    state: room.state,
    currentRound: room.currentRound,
    totalRounds: 3,
    players,
    me: me ? {
      id: me.id,
      name: me.name,
      words: me.words,
      usedWords: me.usedWords,
      selectedWord: me.currentWord
    } : null,
    roundFinishOrder: room.roundFinishOrder[room.currentRound] || [],
    myAssignedPainting,
    allGameWords: room.state === 'SCORING_2' || room.state === 'GAME_OVER' ? room.allAssignedWords : [],
    gallery
  };
}

function broadcastRoom(room) {
  for (const player of room.players) {
    if (player.socketId) {
      io.to(player.socketId).emit('room_state', getPublicRoomState(room, player.id));
    }
  }
}

function resolveContext(socket, payload = {}) {
  const code = socket.data.roomCode || (payload.code || '').toString().trim().toUpperCase();
  const pid = socket.data.playerId || payload.playerId;
  const room = rooms.get(code);
  if (!room) return { room: null, player: null };
  const player = room.players.find(p => p.id === pid);
  if (player) {
    socket.data.roomCode = code;
    socket.data.playerId = player.id;
    player.socketId = socket.id;
    player.connected = true;
    socket.join(code);
  }
  return { room, player };
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ playerName, language, playerId }, cb) => {
    const name = (playerName || 'Artist').trim().substring(0, 18) || 'Artist';
    const lang = language === 'it' ? 'it' : 'en';
    const code = generateRoomCode();
    const pid = playerId || generateId();

    const room = {
      code,
      language: lang,
      hostId: pid,
      state: 'LOBBY',
      currentRound: 1,
      players: [{
        id: pid,
        name,
        socketId: socket.id,
        connected: true,
        words: [],
        usedWords: [],
        currentWord: null,
        roundPenalties: [0, 0, 0],
        totalPenalty: 0,
        guessPoints: 0,
        artistPoints: 0
      }],
      drawings: [],
      roundFinishOrder: { 1: [], 2: [], 3: [] },
      assignments: {},
      allAssignedWords: [],
      scoring1Done: {},
      scoring2Done: {}
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = pid;

    cb?.({ ok: true, code, playerId: pid });
    broadcastRoom(room);
  });

  socket.on('join_room', ({ code, playerName, playerId, isAutoReconnect }, cb) => {
    let cleanCode = (code || '').trim().toUpperCase();
    // On a local Wi-Fi Hotspot, if only 1 room exists and the player didn't type a code, auto-join it!
    if (!cleanCode && !isAutoReconnect && rooms.size === 1) {
      cleanCode = Array.from(rooms.keys())[0];
    }

    const room = rooms.get(cleanCode);
    if (!room) {
      return cb?.({ ok: false, error: 'Room not found. Check the code!' });
    }

    const name = (playerName || 'Artist').trim().substring(0, 18) || 'Artist';
    let player = room.players.find(p => p.id === playerId);

    // Fallback: if player refreshed with cleared storage or new tab, match by name if disconnected or game in progress
    if (!player && playerName) {
      player = room.players.find(
        p => p.name.toLowerCase() === name.toLowerCase() && (!p.connected || room.state !== 'LOBBY')
      );
    }

    if (player) {
      player.socketId = socket.id;
      player.connected = true;
      if (playerName && room.state === 'LOBBY') player.name = name;
    } else {
      if (room.state !== 'LOBBY') {
        return cb?.({ ok: false, error: 'Game already in progress!' });
      }
      const pid = playerId || generateId();
      player = {
        id: pid,
        name,
        socketId: socket.id,
        connected: true,
        words: [],
        usedWords: [],
        currentWord: null,
        roundPenalties: [0, 0, 0],
        totalPenalty: 0,
        guessPoints: 0,
        artistPoints: 0
      };
      room.players.push(player);
    }

    socket.join(cleanCode);
    socket.data.roomCode = cleanCode;
    socket.data.playerId = player.id;

    cb?.({ ok: true, code: cleanCode, playerId: player.id });
    broadcastRoom(room);
  });

  socket.on('set_language', (payload = {}) => {
    const { room, player } = resolveContext(socket, payload);
    if (!room || !player || room.hostId !== player.id || room.state !== 'LOBBY') return;
    room.language = payload.language === 'it' ? 'it' : 'en';
    broadcastRoom(room);
  });

  socket.on('start_game', (payload = {}, cb) => {
    const { room, player } = resolveContext(socket, payload);
    if (!room || !player) return cb?.({ ok: false, error: 'Session disconnected. Refreshing...' });
    if (room.hostId !== player.id) {
      return cb?.({ ok: false, error: 'Only the host can start the game.' });
    }
    if (room.players.length < 2) {
      return cb?.({ ok: false, error: 'Need at least 2 players to start Qbism!' });
    }

    const pool = shuffle(WORDS[room.language] || WORDS.en);
    const allWords = [];

    room.players.forEach((p, idx) => {
      const fiveWords = pool.slice(idx * 5, idx * 5 + 5);
      p.words = fiveWords;
      p.usedWords = [];
      p.currentWord = null;
      p.roundPenalties = [0, 0, 0];
      p.totalPenalty = 0;
      p.guessPoints = 0;
      p.artistPoints = 0;
      allWords.push(...fiveWords);
    });

    room.allAssignedWords = shuffle(allWords);
    room.drawings = [];
    room.roundFinishOrder = { 1: [], 2: [], 3: [] };
    room.assignments = {};
    room.scoring1Done = {};
    room.scoring2Done = {};
    room.currentRound = 1;
    room.state = 'DRAWING';

    cb?.({ ok: true });
    broadcastRoom(room);
  });

  socket.on('select_word', (payload = {}) => {
    const { room, player } = resolveContext(socket, payload);
    if (!room || room.state !== 'DRAWING' || !player) return;
    const { word } = payload;
    if (player.words.includes(word) && !player.usedWords.includes(word)) {
      player.currentWord = word;
      broadcastRoom(room);
    }
  });

  socket.on('submit_drawing', (payload = {}, cb) => {
    const { room, player } = resolveContext(socket, payload);
    if (!room || room.state !== 'DRAWING' || !player) {
      return cb?.({ ok: false, error: 'Reconnecting to room, please tap Done again!' });
    }

    const { word, strokes } = payload;
    const chosenWord = word || player.currentWord;
    if (!chosenWord || !player.words.includes(chosenWord) || player.usedWords.includes(chosenWord)) {
      return cb?.({ ok: false, error: 'Please select a valid unused word!' });
    }

    const alreadySubmitted = room.drawings.some(
      d => d.round === room.currentRound && d.authorId === player.id
    );
    if (alreadySubmitted) {
      broadcastRoom(room);
      return cb?.({ ok: true, penalty: player.roundPenalties[room.currentRound - 1] || 0 });
    }

    const finishList = room.roundFinishOrder[room.currentRound];
    const penalty = finishList.length;
    finishList.push({ playerId: player.id, playerName: player.name, penalty });

    player.roundPenalties[room.currentRound - 1] = penalty;
    player.totalPenalty += penalty;
    player.usedWords.push(chosenWord);
    player.currentWord = null;

    room.drawings.push({
      id: generateId(),
      round: room.currentRound,
      authorId: player.id,
      word: chosenWord,
      strokes: Array.isArray(strokes) ? strokes : [],
      rotation: 0,
      color: 'red',
      assignedTo: null,
      guessedRound1: false,
      guessedRound2: false,
      guessedBy: null
    });

    cb?.({ ok: true, penalty });

    const finishedCount = room.drawings.filter(d => d.round === room.currentRound).length;
    if (finishedCount >= room.players.length) {
      if (room.currentRound < 3) {
        room.currentRound += 1;
      } else {
        const playerIds = room.players.map(p => p.id);
        room.assignments = assignDrawingsDerangement(room.drawings, playerIds);
        room.state = 'SCORING_1';
      }
    }

    broadcastRoom(room);
  });

  socket.on('submit_guess_r1', (payload = {}, cb) => {
    const { room, player } = resolveContext(socket, payload);
    if (!room || room.state !== 'SCORING_1' || !player) {
      return cb?.({ ok: false, error: 'Reconnecting, please try again!' });
    }

    const assigned = room.assignments[player.id] || [];
    const normalizedGuess = normalizeWord(payload.guessText);
    if (!normalizedGuess) return;

    const match = assigned.find(
      d => !d.guessedRound1 && normalizeWord(d.word) === normalizedGuess
    );

    if (match) {
      match.guessedRound1 = true;
      match.guessedBy = player.id;
      player.guessPoints += 2;
      const author = room.players.find(p => p.id === match.authorId);
      if (author) author.artistPoints += 2;

      if (assigned.every(d => d.guessedRound1)) {
        room.scoring1Done[player.id] = true;
        checkScoring1Advance(room);
      }

      broadcastRoom(room);
      return cb?.({ ok: true, correct: true, matchedWord: match.word, color: match.color });
    } else {
      return cb?.({ ok: true, correct: false });
    }
  });

  socket.on('finish_scoring_1', (payload = {}) => {
    const { room, player } = resolveContext(socket, payload);
    if (!room || room.state !== 'SCORING_1' || !player) return;
    room.scoring1Done[player.id] = true;
    checkScoring1Advance(room);
    broadcastRoom(room);
  });

  socket.on('submit_scoring_2', (payload = {}, cb) => {
    const { room, player } = resolveContext(socket, payload);
    if (!room || room.state !== 'SCORING_2' || !player || room.scoring2Done[player.id]) return;

    const assigned = room.assignments[player.id] || [];
    const remaining = assigned.filter(d => !d.guessedRound1 && !d.guessedRound2);
    const picks = (Array.isArray(payload.selectedWords) ? payload.selectedWords : []).slice(0, remaining.length);

    let hits = 0;
    picks.forEach(pickedWord => {
      const match = remaining.find(
        d => !d.guessedRound2 && normalizeWord(d.word) === normalizeWord(pickedWord)
      );
      if (match) {
        match.guessedRound2 = true;
        match.guessedBy = player.id;
        player.guessPoints += 1;
        const author = room.players.find(p => p.id === match.authorId);
        if (author) author.artistPoints += 1;
        hits++;
      }
    });

    room.scoring2Done[player.id] = true;
    cb?.({ ok: true, hits });

    if (room.players.every(p => room.scoring2Done[p.id])) {
      room.state = 'GAME_OVER';
    }

    broadcastRoom(room);
  });

  socket.on('play_again', (payload = {}) => {
    const { room, player } = resolveContext(socket, payload);
    if (!room || !player || room.hostId !== player.id) return;
    room.state = 'LOBBY';
    room.currentRound = 1;
    room.drawings = [];
    room.assignments = {};
    room.scoring1Done = {};
    room.scoring2Done = {};
    broadcastRoom(room);
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    const player = room.players.find(p => p.id === socket.data.playerId);
    // Only mark disconnected if this socket is still the active socket for that player
    if (player && player.socketId === socket.id) {
      player.connected = false;
      broadcastRoom(room);
    }
  });
});

function checkScoring1Advance(room) {
  if (room.players.every(p => room.scoring1Done[p.id])) {
    const anyUnguessed = room.drawings.some(d => !d.guessedRound1);
    if (anyUnguessed) {
      room.state = 'SCORING_2';
      room.players.forEach(p => {
        const assigned = room.assignments[p.id] || [];
        if (assigned.every(d => d.guessedRound1)) {
          room.scoring2Done[p.id] = true;
        }
      });
      if (room.players.every(p => room.scoring2Done[p.id])) {
        room.state = 'GAME_OVER';
      }
    } else {
      room.state = 'GAME_OVER';
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('\n==================================================');
  console.log('🎨 QBISM HOTSPOT / WI-FI SERVER RUNNING!');
  console.log('==================================================');
  console.log(`👉 On this device:  http://localhost:${PORT}`);
  if (ips.length > 0) {
    ips.forEach(ip => {
      console.log(`📶 Friends on Wi-Fi/Hotspot open:  http://${ip.address}:${PORT}`);
    });
  } else {
    console.log(`📶 Turn on Wi-Fi Hotspot, then friends open: http://192.168.43.1:${PORT}`);
  }
  console.log('==================================================\n');
});
