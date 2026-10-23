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

function getWordPool(language, difficulty) {
  const langObj = WORDS[language] || WORDS.en;
  if (difficulty === 'advanced') {
    return [...langObj.advanced];
  } else if (difficulty === 'mixed') {
    return Array.from(new Set([...langObj.normal, ...langObj.advanced]));
  }
  return [...langObj.normal];
}

/**
 * Strictly assigns 3 drawings per player (1 from each round) such that
 * NO player EVER receives any of their own drawings (100% mathematical derangement).
 */
function assignDrawingsDerangement(drawings, playerIds) {
  const N = playerIds.length;
  const assignments = {};
  playerIds.forEach(pid => { assignments[pid] = []; });

  const colors = ['red', 'green', 'blue'];
  const rotations = [0, 90, 180, 270];

  // Create a shuffled ring of playerIds
  const ring = shuffle(playerIds);

  // Pick non-zero cyclic shifts (1 .. N-1) for the 3 rounds so ring[i]'s drawing goes to ring[(i + shift) % N].
  // Because shift is between 1 and N-1, (i + shift) % N can NEVER equal i!
  const possibleShifts = [];
  for (let s = 1; s < N; s++) possibleShifts.push(s);

  const roundShifts = [];
  for (let r = 0; r < 3; r++) {
    const shuffledShifts = shuffle(possibleShifts);
    roundShifts.push(shuffledShifts[r % shuffledShifts.length] || 1);
  }

  for (let r = 1; r <= 3; r++) {
    const shift = roundShifts[r - 1];
    const roundDrawings = [...drawings.filter(d => d.round === r)];

    // Map each author in the ring to their drawing in round r
    for (let i = 0; i < N; i++) {
      const authorId = ring[i];
      const recipientId = ring[(i + shift) % N];
      const drawing = roundDrawings.find(d => d.authorId === authorId);
      if (drawing) {
        drawing.assignedTo = recipientId;
        assignments[recipientId].push(drawing);
      }
    }
  }

  // Final safety verification: guarantee no drawing is ever assigned to its own author
  for (const pid of playerIds) {
    for (let idx = 0; idx < assignments[pid].length; idx++) {
      const d = assignments[pid][idx];
      if (d.authorId === pid) {
        // Swap with another player's drawing from the same round
        const otherPid = playerIds.find(
          op => op !== pid && assignments[op][idx] && assignments[op][idx].authorId !== pid
        );
        if (otherPid) {
          const temp = assignments[otherPid][idx];
          d.assignedTo = otherPid;
          temp.assignedTo = pid;
          assignments[otherPid][idx] = d;
          assignments[pid][idx] = temp;
        }
      }
    }

    // Assign random rotation (0, 90, 180, 270) and distinct colors (red, green, blue)
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
    totalDrawTimeSec: Number((p.totalDrawTimeSec || 0).toFixed(1)),
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
      // In hardcore mode during scoring, hide individual RGB colors so all 3 are drawn in monochrome
      color: (room.hardcore && room.state !== 'GAME_OVER') ? 'mono' : d.color,
      guessedRound1: d.guessedRound1,
      guessedRound2: d.guessedRound2,
      guessedBy: d.guessedBy,
      durationSec: d.durationSec,
      word: (d.guessedRound1 || d.guessedRound2 || room.state === 'GAME_OVER') ? d.word : null,
      wordLength: d.word.length
    }));
  }

  let gallery = null;
  let allDrawingsSummary = null;
  if (room.state === 'GAME_OVER') {
    gallery = room.players.map(p => ({
      playerId: p.id,
      playerName: p.name,
      drawings: (room.assignments[p.id] || []).map(d => ({
        id: d.id,
        round: d.round,
        authorId: d.authorId,
        authorName: room.players.find(pl => pl.id === d.authorId)?.name || 'Unknown',
        word: d.word,
        strokes: d.strokes,
        rotation: d.rotation,
        color: d.color,
        durationSec: d.durationSec,
        penalty: d.penalty,
        guessedRound1: d.guessedRound1,
        guessedRound2: d.guessedRound2
      }))
    }));

    allDrawingsSummary = room.drawings.map(d => ({
      id: d.id,
      round: d.round,
      word: d.word,
      authorId: d.authorId,
      authorName: room.players.find(pl => pl.id === d.authorId)?.name || 'Unknown',
      assignedToId: d.assignedTo,
      assignedToName: room.players.find(pl => pl.id === d.assignedTo)?.name || 'Unknown',
      durationSec: d.durationSec,
      penalty: d.penalty,
      rotation: d.rotation,
      color: d.color,
      guessedRound1: d.guessedRound1,
      guessedRound2: d.guessedRound2
    }));
  }

  const myR1Attempts = me ? (room.scoring1Attempts[me.id] || []) : [];

  return {
    code: room.code,
    language: room.language,
    difficulty: room.difficulty || 'normal',
    hardcore: !!room.hardcore,
    state: room.state,
    currentRound: room.currentRound,
    totalRounds: 3,
    players,
    me: me ? {
      id: me.id,
      name: me.name,
      words: me.words,
      usedWords: me.usedWords,
      selectedWord: me.currentWord,
      r1Attempts: myR1Attempts,
      r1AttemptsLeft: Math.max(0, 3 - myR1Attempts.length)
    } : null,
    roundFinishOrder: room.roundFinishOrder[room.currentRound] || [],
    myAssignedPainting,
    allGameWords: room.state === 'SCORING_2' || room.state === 'GAME_OVER' ? room.allAssignedWords : [],
    gallery,
    allDrawingsSummary
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
  socket.on('create_room', ({ playerName, language, difficulty, hardcore, playerId }, cb) => {
    const name = (playerName || 'Artist').trim().substring(0, 18) || 'Artist';
    const lang = language === 'it' ? 'it' : 'en';
    const diff = ['normal', 'advanced', 'mixed'].includes(difficulty) ? difficulty : 'normal';
    const code = generateRoomCode();
    const pid = playerId || generateId();

    const room = {
      code,
      language: lang,
      difficulty: diff,
      hardcore: !!hardcore,
      hostId: pid,
      state: 'LOBBY',
      currentRound: 1,
      roundStartTimes: { 1: 0, 2: 0, 3: 0 },
      players: [{
        id: pid,
        name,
        socketId: socket.id,
        connected: true,
        words: [],
        usedWords: [],
        currentWord: null,
        wordSelectedAt: 0,
        roundPenalties: [0, 0, 0],
        totalPenalty: 0,
        totalDrawTimeSec: 0,
        guessPoints: 0,
        artistPoints: 0
      }],
      drawings: [],
      roundFinishOrder: { 1: [], 2: [], 3: [] },
      assignments: {},
      allAssignedWords: [],
      scoring1Attempts: {},
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
    if (!cleanCode && !isAutoReconnect && rooms.size === 1) {
      cleanCode = Array.from(rooms.keys())[0];
    }

    const room = rooms.get(cleanCode);
    if (!room) {
      return cb?.({ ok: false, error: 'Room not found. Check the code!' });
    }

    const name = (playerName || 'Artist').trim().substring(0, 18) || 'Artist';
    let player = room.players.find(p => p.id === playerId);

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
        wordSelectedAt: 0,
        roundPenalties: [0, 0, 0],
        totalPenalty: 0,
        totalDrawTimeSec: 0,
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

  socket.on('set_options', (payload = {}) => {
    const { room, player } = resolveContext(socket, payload);
    if (!room || !player || room.hostId !== player.id || room.state !== 'LOBBY') return;
    if (payload.language) room.language = payload.language === 'it' ? 'it' : 'en';
    if (payload.difficulty && ['normal', 'advanced', 'mixed'].includes(payload.difficulty)) {
      room.difficulty = payload.difficulty;
    }
    if (typeof payload.hardcore === 'boolean') {
      room.hardcore = payload.hardcore;
    }
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

    const pool = shuffle(getWordPool(room.language, room.difficulty));
    const allWords = [];
    const now = Date.now();

    room.players.forEach((p, idx) => {
      const fiveWords = pool.slice(idx * 5, idx * 5 + 5);
      p.words = fiveWords;
      p.usedWords = [];
      p.currentWord = null;
      p.wordSelectedAt = now;
      p.roundPenalties = [0, 0, 0];
      p.totalPenalty = 0;
      p.totalDrawTimeSec = 0;
      p.guessPoints = 0;
      p.artistPoints = 0;
      allWords.push(...fiveWords);
    });

    room.allAssignedWords = shuffle(allWords);
    room.drawings = [];
    room.roundFinishOrder = { 1: [], 2: [], 3: [] };
    room.roundStartTimes = { 1: now, 2: 0, 3: 0 };
    room.assignments = {};
    room.scoring1Attempts = {};
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
      player.wordSelectedAt = Date.now();
      broadcastRoom(room);
    }
  });

  socket.on('submit_drawing', (payload = {}, cb) => {
    const { room, player } = resolveContext(socket, payload);
    if (!room || room.state !== 'DRAWING' || !player) {
      return cb?.({ ok: false, error: 'Reconnecting to room, please tap Done again!' });
    }

    const { word, strokes, durationSec: clientDuration } = payload;
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

    const now = Date.now();
    const startRef = player.wordSelectedAt || room.roundStartTimes[room.currentRound] || now;
    const serverElapsed = (now - startRef) / 1000;
    const rawDuration = (typeof clientDuration === 'number' && clientDuration > 0)
      ? clientDuration
      : serverElapsed;
    const durationSec = Number(Math.max(0.5, Math.min(600, rawDuration)).toFixed(1));

    const finishList = room.roundFinishOrder[room.currentRound];
    const penalty = finishList.length;
    finishList.push({ playerId: player.id, playerName: player.name, penalty, durationSec });

    player.roundPenalties[room.currentRound - 1] = penalty;
    player.totalPenalty += penalty;
    player.totalDrawTimeSec = Number(((player.totalDrawTimeSec || 0) + durationSec).toFixed(1));
    player.usedWords.push(chosenWord);
    player.currentWord = null;
    player.wordSelectedAt = 0;

    room.drawings.push({
      id: generateId(),
      round: room.currentRound,
      authorId: player.id,
      word: chosenWord,
      strokes: Array.isArray(strokes) ? strokes : [],
      durationSec,
      penalty,
      rotation: 0,
      color: 'red',
      assignedTo: null,
      guessedRound1: false,
      guessedRound2: false,
      guessedBy: null
    });

    cb?.({ ok: true, penalty, durationSec });

    const finishedCount = room.drawings.filter(d => d.round === room.currentRound).length;
    if (finishedCount >= room.players.length) {
      if (room.currentRound < 3) {
        room.currentRound += 1;
        room.roundStartTimes[room.currentRound] = Date.now();
        room.players.forEach(p => { p.wordSelectedAt = Date.now(); });
      } else {
        const playerIds = room.players.map(p => p.id);
        room.assignments = assignDrawingsDerangement(room.drawings, playerIds);
        room.state = 'SCORING_1';
      }
    }

    broadcastRoom(room);
  });

  // Round 1 Scoring: Max 3 guesses per player (1 per drawing)
  socket.on('submit_guess_r1', (payload = {}, cb) => {
    const { room, player } = resolveContext(socket, payload);
    if (!room || room.state !== 'SCORING_1' || !player) {
      return cb?.({ ok: false, error: 'Reconnecting, please try again!' });
    }
    if (room.scoring1Done[player.id]) {
      return cb?.({ ok: false, error: 'You have already finished Round 1!' });
    }

    if (!room.scoring1Attempts[player.id]) {
      room.scoring1Attempts[player.id] = [];
    }
    const attempts = room.scoring1Attempts[player.id];
    if (attempts.length >= 3) {
      room.scoring1Done[player.id] = true;
      checkScoring1Advance(room);
      broadcastRoom(room);
      return cb?.({ ok: false, error: 'All 3 guesses used!' });
    }

    const rawText = (payload.guessText || '').toString().trim();
    const normalizedGuess = normalizeWord(rawText);
    if (!normalizedGuess) return;

    const assigned = room.assignments[player.id] || [];
    const match = assigned.find(
      d => !d.guessedRound1 && normalizeWord(d.word) === normalizedGuess
    );

    let isCorrect = false;
    let matchedWord = null;

    if (match) {
      isCorrect = true;
      matchedWord = match.word;
      match.guessedRound1 = true;
      match.guessedBy = player.id;
      player.guessPoints += 2;
      const author = room.players.find(p => p.id === match.authorId);
      if (author) author.artistPoints += 2;
    }

    attempts.push({
      guessText: rawText,
      correct: isCorrect,
      matchedWord
    });

    // Automatically finish Round 1 for this player if they used all 3 guesses OR guessed all 3 drawings
    if (attempts.length >= 3 || assigned.every(d => d.guessedRound1)) {
      room.scoring1Done[player.id] = true;
      checkScoring1Advance(room);
    }

    broadcastRoom(room);
    return cb?.({
      ok: true,
      correct: isCorrect,
      matchedWord,
      attemptsUsed: attempts.length,
      attemptsLeft: Math.max(0, 3 - attempts.length)
    });
  });

  socket.on('finish_scoring_1', (payload = {}) => {
    const { room, player } = resolveContext(socket, payload);
    if (!room || room.state !== 'SCORING_1' || !player) return;
    room.scoring1Done[player.id] = true;
    checkScoring1Advance(room);
    broadcastRoom(room);
  });

  // Round 2 Scoring: Max 1 guess per remaining unguessed drawing (up to 3 total)
  socket.on('submit_scoring_2', (payload = {}, cb) => {
    const { room, player } = resolveContext(socket, payload);
    if (!room || room.state !== 'SCORING_2' || !player || room.scoring2Done[player.id]) return;

    const assigned = room.assignments[player.id] || [];
    const remaining = assigned.filter(d => !d.guessedRound1 && !d.guessedRound2);
    const maxPicks = Math.min(3, remaining.length);
    const picks = (Array.isArray(payload.selectedWords) ? payload.selectedWords : []).slice(0, maxPicks);

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
    room.scoring1Attempts = {};
    room.scoring1Done = {};
    room.scoring2Done = {};
    broadcastRoom(room);
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    const player = room.players.find(p => p.id === socket.data.playerId);
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
  console.log('🎨 QBISM SERVER RUNNING!');
  console.log('==================================================');
  console.log(`👉 On this device:  http://localhost:${PORT}`);
  if (ips.length > 0) {
    ips.forEach(ip => {
      console.log(`📶 Friends on Wi-Fi/Hotspot open:  http://${ip.address}:${PORT}`);
    });
  }
  console.log('==================================================\n');
});
