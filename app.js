// ==========================================================
// QBISM — Serverless P2P Multiplayer (PeerJS WebRTC Edition)
// Any Android / iOS / PC browser can host a room directly!
// ==========================================================

const WORDS = {
  en: [
    "apple", "banana", "car", "house", "tree", "dog", "cat", "sun", "moon", "star",
    "fish", "bird", "boat", "airplane", "bicycle", "chair", "table", "book", "key", "clock",
    "shoe", "hat", "glasses", "umbrella", "flower", "mountain", "cloud", "rain", "fire", "heart",
    "smile", "eye", "hand", "foot", "pizza", "cake", "icecream", "coffee", "cup", "bottle",
    "spoon", "fork", "knife", "scissors", "pencil", "phone", "computer", "television", "camera", "guitar",
    "drum", "bell", "crown", "sword", "shield", "castle", "bridge", "train", "bus", "rocket",
    "robot", "ghost", "skull", "spider", "snake", "butterfly", "bee", "elephant", "giraffe", "lion",
    "monkey", "penguin", "turtle", "frog", "whale", "shark", "octopus", "crab", "snail", "mushroom",
    "cactus", "palm", "carrot", "corn", "strawberry", "grapes", "watermelon", "pineapple", "cheese", "bread",
    "egg", "hamburger", "fries", "donut", "candy", "lollipop", "balloon", "gift", "candle", "lightbulb",
    "magnet", "anchor", "compass", "map", "flag", "trophy", "medal", "ball", "tennis", "basketball",
    "snowman", "snowflake", "rainbow", "tornado", "volcano", "island", "tent", "campfire", "ladder", "hammer",
    "wrench", "saw", "paintbrush", "bucket", "broom", "soap", "toothbrush", "mirror", "comb", "ring",
    "necklace", "shirt", "pants", "dress", "sock", "glove", "boot", "backpack", "suitcase", "wallet",
    "coin", "diamond", "treasure", "pirate", "wizard", "dragon", "unicorn", "mermaid", "alien", "ufo"
  ],
  it: [
    "mela", "banana", "auto", "casa", "albero", "cane", "gatto", "sole", "luna", "stella",
    "pesce", "uccello", "barca", "aereo", "bicicletta", "sedia", "tavolo", "libro", "chiave", "orologio",
    "scarpa", "cappello", "occhiali", "ombrello", "fiore", "montagna", "nuvola", "pioggia", "fuoco", "cuore",
    "sorriso", "occhio", "mano", "piede", "pizza", "torta", "gelato", "caffe", "tazza", "bottiglia",
    "cucchiaio", "forchetta", "coltello", "forbici", "matita", "telefono", "computer", "televisore", "fotocamera", "chitarra",
    "tamburo", "campana", "corona", "spada", "scudo", "castello", "ponte", "treno", "autobus", "razzo",
    "robot", "fantasma", "teschio", "ragno", "serpente", "farfalla", "ape", "elefante", "giraffa", "leone",
    "scimmia", "pinguino", "tartaruga", "rana", "balena", "squalo", "polpo", "granchio", "lumaca", "fungo",
    "cactus", "palma", "carota", "mais", "fragola", "uva", "anguria", "ananas", "formaggio", "pane",
    "uovo", "hamburger", "patatine", "ciambella", "caramella", "leccalecca", "palloncino", "regalo", "candela", "lampadina",
    "magnete", "ancora", "bussola", "mappa", "bandiera", "trofeo", "medaglia", "palla", "tennis", "basket",
    "pupazzo", "fiocco", "arcobaleno", "tornado", "vulcano", "isola", "tenda", "falo", "scala", "martello",
    "chiaveinglese", "sega", "pennello", "secchio", "scopa", "sapone", "spazzolino", "specchio", "pettine", "anello",
    "collana", "maglietta", "pantaloni", "vestito", "calzino", "guanto", "stivale", "zaino", "valigia", "portafoglio",
    "moneta", "diamante", "tesoro", "pirata", "mago", "drago", "unicorno", "sirena", "alieno", "ufo"
  ]
};

const PEER_PREFIX = 'qbism-room-';

// Persistent player ID across reloads
let myPlayerId = sessionStorage.getItem('qbism_player_id');
if (!myPlayerId) {
  myPlayerId = 'p_' + Math.random().toString(36).substring(2, 10);
  sessionStorage.setItem('qbism_player_id', myPlayerId);
}

let selectedCreateLang = 'en';
let currentRoomState = null;

// P2P Networking State
let peer = null;
let isHosting = false;
let hostRoom = null; // Full authoritative room state when this phone/browser is Host
let guestConnections = new Map(); // playerId -> DataConnection (used by Host)
let hostConnection = null; // DataConnection to Host (used by Guest)

// Drawing state
let currentRoundTracked = 0;
let activeWord = null;
let strokes = [];
let currentStroke = null;
let isDrawing = false;

// Scoring state
let activeLayerFilter = 'all';
let r1Typed = '';
let r2SelectedWords = [];

// DOM Elements
const screens = {
  home: document.getElementById('screen-home'),
  lobby: document.getElementById('screen-lobby'),
  drawing: document.getElementById('screen-drawing'),
  scoring: document.getElementById('screen-scoring'),
  gameover: document.getElementById('screen-gameover')
};

const roomBadge = document.getElementById('room-badge');
const headerRoomCode = document.getElementById('header-room-code');
const toastEl = document.getElementById('toast');

function showToast(msg, duration = 2600) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toastEl.classList.add('hidden'), duration);
}

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle('active', key === name);
  });
}

// ==========================================
// HELPER UTILITIES (Host Game Engine)
// ==========================================
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
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

// ==========================================
// P2P HOST ENGINE (Runs in Host Phone Browser)
// ==========================================
function broadcastHostState() {
  if (!isHosting || !hostRoom) return;
  // Update Host's own UI immediately
  onReceiveRoomState(getPublicRoomState(hostRoom, myPlayerId));
  // Send personalized state to each connected Guest
  for (const [pid, conn] of guestConnections.entries()) {
    if (conn && conn.open) {
      conn.send({
        type: 'room_state',
        state: getPublicRoomState(hostRoom, pid)
      });
    }
  }
}

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

function handleActionOnHost(playerId, action, payload = {}) {
  const room = hostRoom;
  if (!room) return { ok: false, error: 'No room active' };

  if (action === 'set_language') {
    if (room.hostId !== playerId || room.state !== 'LOBBY') return { ok: false };
    room.language = payload.language === 'it' ? 'it' : 'en';
    broadcastHostState();
    return { ok: true };
  }

  if (action === 'start_game') {
    if (room.hostId !== playerId) return { ok: false, error: 'Only the host can start the game.' };
    if (room.players.length < 2) return { ok: false, error: 'Need at least 2 players to start Qbism!' };

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

    broadcastHostState();
    return { ok: true };
  }

  if (action === 'select_word') {
    if (room.state !== 'DRAWING') return { ok: false };
    const player = room.players.find(p => p.id === playerId);
    if (!player) return { ok: false };
    if (player.words.includes(payload.word) && !player.usedWords.includes(payload.word)) {
      player.currentWord = payload.word;
      broadcastHostState();
    }
    return { ok: true };
  }

  if (action === 'submit_drawing') {
    if (room.state !== 'DRAWING') return { ok: false };
    const player = room.players.find(p => p.id === playerId);
    if (!player) return { ok: false };

    const chosenWord = payload.word || player.currentWord;
    if (!chosenWord || !player.words.includes(chosenWord) || player.usedWords.includes(chosenWord)) {
      return { ok: false, error: 'Please select a valid unused word!' };
    }

    const alreadySubmitted = room.drawings.some(
      d => d.round === room.currentRound && d.authorId === player.id
    );
    if (alreadySubmitted) return { ok: false };

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
      strokes: Array.isArray(payload.strokes) ? payload.strokes : [],
      rotation: 0,
      color: 'red',
      assignedTo: null,
      guessedRound1: false,
      guessedRound2: false,
      guessedBy: null
    });

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

    broadcastHostState();
    return { ok: true, penalty };
  }

  if (action === 'submit_guess_r1') {
    if (room.state !== 'SCORING_1') return { ok: false };
    const player = room.players.find(p => p.id === playerId);
    if (!player) return { ok: false };

    const assigned = room.assignments[player.id] || [];
    const normalizedGuess = normalizeWord(payload.guessText);
    if (!normalizedGuess) return { ok: false };

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

      broadcastHostState();
      return { ok: true, correct: true, matchedWord: match.word, color: match.color };
    } else {
      return { ok: true, correct: false };
    }
  }

  if (action === 'finish_scoring_1') {
    if (room.state !== 'SCORING_1') return { ok: false };
    room.scoring1Done[playerId] = true;
    checkScoring1Advance(room);
    broadcastHostState();
    return { ok: true };
  }

  if (action === 'submit_scoring_2') {
    if (room.state !== 'SCORING_2') return { ok: false };
    const player = room.players.find(p => p.id === playerId);
    if (!player || room.scoring2Done[player.id]) return { ok: false };

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
    if (room.players.every(p => room.scoring2Done[p.id])) {
      room.state = 'GAME_OVER';
    }

    broadcastHostState();
    return { ok: true, hits };
  }

  if (action === 'play_again') {
    if (room.hostId !== playerId) return { ok: false };
    room.state = 'LOBBY';
    room.currentRound = 1;
    room.drawings = [];
    room.assignments = {};
    room.scoring1Done = {};
    room.scoring2Done = {};
    broadcastHostState();
    return { ok: true };
  }

  return { ok: false };
}

// Unified dispatcher: executes locally if Host, or sends over WebRTC to Host if Guest
let pendingCallbacks = new Map();

function sendAction(action, payload = {}, cb) {
  if (isHosting) {
    const res = handleActionOnHost(myPlayerId, action, payload);
    if (cb) cb(res);
  } else if (hostConnection && hostConnection.open) {
    const reqId = generateId();
    if (cb) pendingCallbacks.set(reqId, cb);
    hostConnection.send({
      type: 'action',
      reqId,
      playerId: myPlayerId,
      action,
      payload
    });
  } else {
    showToast('Connection to Host lost. Reconnecting...');
  }
}

// Start Hosting on this Android/iOS/Desktop browser
function startHostingRoom(playerName, language) {
  const code = generateRoomCode();
  const cleanName = (playerName || 'Artist').trim().substring(0, 18) || 'Artist';

  showToast('Starting room on your device...');
  if (peer) peer.destroy();

  peer = new Peer(PEER_PREFIX + code);

  peer.on('open', () => {
    isHosting = true;
    hostRoom = {
      code,
      language: language === 'it' ? 'it' : 'en',
      hostId: myPlayerId,
      state: 'LOBBY',
      currentRound: 1,
      players: [{
        id: myPlayerId,
        name: cleanName,
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

    broadcastHostState();
  });

  peer.on('connection', (conn) => {
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'join') {
        const gId = msg.playerId || generateId();
        const gName = (msg.playerName || 'Artist').trim().substring(0, 18) || 'Artist';
        let existing = hostRoom.players.find(p => p.id === gId);

        if (existing) {
          existing.connected = true;
          existing.name = gName;
        } else {
          if (hostRoom.state !== 'LOBBY') {
            conn.send({ type: 'join_result', ok: false, error: 'Game already in progress!' });
            return;
          }
          existing = {
            id: gId,
            name: gName,
            connected: true,
            words: [],
            usedWords: [],
            currentWord: null,
            roundPenalties: [0, 0, 0],
            totalPenalty: 0,
            guessPoints: 0,
            artistPoints: 0
          };
          hostRoom.players.push(existing);
        }

        conn._playerId = gId;
        guestConnections.set(gId, conn);
        conn.send({ type: 'join_result', ok: true, code: hostRoom.code, playerId: gId });
        broadcastHostState();
      } else if (msg.type === 'action') {
        const res = handleActionOnHost(msg.playerId, msg.action, msg.payload);
        if (msg.reqId) {
          conn.send({ type: 'action_ack', reqId: msg.reqId, res });
        }
      }
    });

    conn.on('close', () => {
      if (conn._playerId && hostRoom) {
        const p = hostRoom.players.find(pl => pl.id === conn._playerId);
        if (p) p.connected = false;
        broadcastHostState();
      }
    });
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      // Extremely rare code collision -> retry with new code
      startHostingRoom(playerName, language);
    } else {
      showToast('Network error: ' + err.type);
    }
  });
}

// Join a Host phone's room by 5-character code
function joinHostRoom(code, playerName) {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) return showToast('Enter a 5-letter room code!');

  showToast(`Connecting to room ${cleanCode}...`);
  if (peer) peer.destroy();

  isHosting = false;
  peer = new Peer();

  peer.on('open', () => {
    const conn = peer.connect(PEER_PREFIX + cleanCode, { reliable: true });
    hostConnection = conn;

    conn.on('open', () => {
      conn.send({
        type: 'join',
        playerId: myPlayerId,
        playerName: (playerName || 'Artist').trim() || 'Artist'
      });
    });

    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'join_result') {
        if (!msg.ok) {
          showToast(msg.error || 'Could not join room');
        }
      } else if (msg.type === 'room_state') {
        onReceiveRoomState(msg.state);
      } else if (msg.type === 'action_ack' && msg.reqId) {
        const cb = pendingCallbacks.get(msg.reqId);
        if (cb) {
          pendingCallbacks.delete(msg.reqId);
          cb(msg.res);
        }
      }
    });

    conn.on('close', () => {
      showToast('Disconnected from Host phone.');
    });
  });

  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable') {
      showToast('Room not found! Make sure the Host phone has the game open.');
    } else {
      showToast('Connection error: ' + err.type);
    }
  });
}

// ==========================================
// UI INITIALIZATION & EVENTS
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');
  if (roomParam) {
    document.getElementById('join-code-input').value = roomParam.toUpperCase();
  }
  const savedName = localStorage.getItem('qbism_player_name');
  if (savedName) {
    document.getElementById('player-name').value = savedName;
  }
  initBlindCanvas();
  initOnscreenKeyboard();
});

// Language selection on Home screen
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedCreateLang = btn.dataset.lang;
  });
});

// Create Room (Host directly on this phone/browser)
document.getElementById('btn-create').addEventListener('click', () => {
  const playerName = document.getElementById('player-name').value.trim() || 'Artist';
  localStorage.setItem('qbism_player_name', playerName);
  startHostingRoom(playerName, selectedCreateLang);
});

// Join Room
document.getElementById('btn-join').addEventListener('click', () => {
  const playerName = document.getElementById('player-name').value.trim() || 'Artist';
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  if (!code) return showToast('Enter a 5-letter room code!');
  localStorage.setItem('qbism_player_name', playerName);
  joinHostRoom(code, playerName);
});

// Lobby language switch
document.querySelectorAll('.lang-switch-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    sendAction('set_language', { language: btn.dataset.lang });
  });
});

// WhatsApp & Invite Link Sharing
document.getElementById('btn-whatsapp').addEventListener('click', () => {
  if (!currentRoomState) return;
  const baseUrl = window.location.origin + window.location.pathname;
  const inviteUrl = `${baseUrl}?room=${currentRoomState.code}`;
  const text = `🎨 Join my Qbism game! Code: *${currentRoomState.code}*\nPlay here: ${inviteUrl}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
});

document.getElementById('btn-copy-link').addEventListener('click', async () => {
  if (!currentRoomState) return;
  const baseUrl = window.location.origin + window.location.pathname;
  const inviteUrl = `${baseUrl}?room=${currentRoomState.code}`;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    showToast('Invite link copied to clipboard!');
  } catch {
    showToast(`Room Code: ${currentRoomState.code}`);
  }
});

// Start Game
document.getElementById('btn-start-game').addEventListener('click', () => {
  sendAction('start_game', {}, (res) => {
    if (!res?.ok) showToast(res?.error || 'Cannot start game');
  });
});

// Play Again
document.getElementById('btn-play-again').addEventListener('click', () => {
  sendAction('play_again');
});

// ==========================================
// BLIND DRAWING CANVAS (Mouse & Touch)
// ==========================================
function initBlindCanvas() {
  const canvas = document.getElementById('draw-canvas');
  const touchDot = document.getElementById('touch-dot');

  function getNormalizedPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)), px: clientX - rect.left, py: clientY - rect.top };
  }

  function startStroke(evt) {
    evt.preventDefault();
    isDrawing = true;
    const pos = getNormalizedPos(evt);
    currentStroke = [[pos.x, pos.y]];
    strokes.push(currentStroke);
    touchDot.style.left = `${pos.px}px`;
    touchDot.style.top = `${pos.py}px`;
    touchDot.classList.remove('hidden');
  }

  function moveStroke(evt) {
    if (!isDrawing || !currentStroke) return;
    evt.preventDefault();
    const pos = getNormalizedPos(evt);
    currentStroke.push([pos.x, pos.y]);
    touchDot.style.left = `${pos.px}px`;
    touchDot.style.top = `${pos.py}px`;
  }

  function endStroke(evt) {
    if (!isDrawing) return;
    evt?.preventDefault();
    isDrawing = false;
    currentStroke = null;
    touchDot.classList.add('hidden');
  }

  canvas.addEventListener('mousedown', startStroke);
  canvas.addEventListener('mousemove', moveStroke);
  window.addEventListener('mouseup', endStroke);

  canvas.addEventListener('touchstart', startStroke, { passive: false });
  canvas.addEventListener('touchmove', moveStroke, { passive: false });
  window.addEventListener('touchend', endStroke);

  document.getElementById('btn-clear-canvas').addEventListener('click', () => {
    strokes = [];
    currentStroke = null;
    showToast('Blind canvas cleared! Draw again.');
  });

  document.getElementById('btn-done-drawing').addEventListener('click', () => {
    if (!activeWord) return showToast('Select a word first!');
    if (strokes.length === 0) {
      return showToast('Draw something inside the square frame first!');
    }
    sendAction('submit_drawing', { word: activeWord, strokes }, (res) => {
      if (res?.ok) {
        const pen = res.penalty;
        document.getElementById('my-round-penalty-msg').textContent =
          pen === 0
            ? '⚡ You finished 1st! 0 Penalty Points!'
            : `⏱️ ${pen} player(s) finished before you (-${pen} penalty pt).`;
      } else if (res?.error) {
        showToast(res.error);
      }
    });
  });
}

// ==========================================
// CUBIST RENDERER (Rotation + RGB Coloring)
// ==========================================
const COLOR_HEX = {
  red: '#ff2a55',
  green: '#00c853',
  blue: '#2962ff'
};

function renderCubistCanvas(canvas, drawings, filterColor = 'all') {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
  ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
  ctx.stroke();
  ctx.restore();

  if (!Array.isArray(drawings)) return;

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';

  drawings.forEach(d => {
    if (filterColor !== 'all' && d.color !== filterColor) return;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(((d.rotation || 0) * Math.PI) / 180);
    ctx.translate(-W / 2, -H / 2);

    ctx.strokeStyle = COLOR_HEX[d.color] || '#ff2a55';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    (d.strokes || []).forEach(stroke => {
      if (!stroke || stroke.length === 0) return;
      ctx.beginPath();
      stroke.forEach(([nx, ny], idx) => {
        const x = nx * W;
        const y = ny * H;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (stroke.length === 1) {
        ctx.lineTo(stroke[0][0] * W + 0.5, stroke[0][1] * H + 0.5);
      }
      ctx.stroke();
    });

    ctx.restore();
  });

  ctx.restore();
}

document.querySelectorAll('.layer-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeLayerFilter = btn.dataset.layer;
    if (currentRoomState?.myAssignedPainting) {
      renderCubistCanvas(
        document.getElementById('cubist-canvas'),
        currentRoomState.myAssignedPainting,
        activeLayerFilter
      );
    }
  });
});

// ==========================================
// ON-SCREEN KEYBOARD FOR SCORING ROUND 1
// ==========================================
function initOnscreenKeyboard() {
  const kbContainer = document.getElementById('onscreen-keyboard');
  const rows = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['⌫', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'GUESS']
  ];

  rows.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';
    row.forEach(key => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kb-key';
      if (key === '⌫') btn.classList.add('kb-wide');
      if (key === 'GUESS') btn.classList.add('kb-enter');
      btn.textContent = key;
      btn.addEventListener('click', () => handleVirtualKey(key));
      rowEl.appendChild(btn);
    });
    kbContainer.appendChild(rowEl);
  });

  window.addEventListener('keydown', (e) => {
    if (!currentRoomState || currentRoomState.state !== 'SCORING_1') return;
    const me = currentRoomState.players.find(p => p.id === myPlayerId);
    if (me?.hasFinishedScoring1) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      handleVirtualKey('⌫');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleVirtualKey('GUESS');
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      handleVirtualKey(e.key.toUpperCase());
    }
  });

  document.getElementById('btn-r1-finish').addEventListener('click', () => {
    sendAction('finish_scoring_1');
  });

  document.getElementById('btn-r2-submit').addEventListener('click', () => {
    sendAction('submit_scoring_2', { selectedWords: r2SelectedWords }, (res) => {
      if (res?.ok) {
        showToast(`Round 2 complete! You got ${res.hits} right!`);
      }
    });
  });
}

function handleVirtualKey(key) {
  if (key === '⌫') {
    r1Typed = r1Typed.slice(0, -1);
    document.getElementById('r1-typed-text').textContent = r1Typed;
  } else if (key === 'GUESS') {
    if (!r1Typed.trim()) return;
    const guessText = r1Typed;
    r1Typed = '';
    document.getElementById('r1-typed-text').textContent = '';
    sendAction('submit_guess_r1', { guessText }, (res) => {
      if (res?.correct) {
        showToast(`🎉 Correct! "${res.matchedWord.toUpperCase()}" (+2 pts to you & artist!)`);
      } else {
        showToast(`❌ "${guessText}" is not one of the unguessed words. Try again!`);
      }
    });
  } else {
    if (r1Typed.length < 18) {
      r1Typed += key;
      document.getElementById('r1-typed-text').textContent = r1Typed;
    }
  }
}

// ==========================================
// STATE SYNCHRONIZATION
// ==========================================
function onReceiveRoomState(state) {
  const prevState = currentRoomState?.state;
  currentRoomState = state;

  roomBadge.classList.remove('hidden');
  headerRoomCode.textContent = state.code;

  if (state.state === 'LOBBY') {
    showScreen('lobby');
    renderLobby(state);
  } else if (state.state === 'DRAWING') {
    showScreen('drawing');
    renderDrawingPhase(state);
  } else if (state.state === 'SCORING_1' || state.state === 'SCORING_2') {
    if (prevState !== state.state) {
      activeLayerFilter = 'all';
      r1Typed = '';
      r2SelectedWords = [];
      document.getElementById('r1-typed-text').textContent = '';
      document.querySelectorAll('.layer-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.layer === 'all');
      });
    }
    showScreen('scoring');
    renderScoringPhase(state);
  } else if (state.state === 'GAME_OVER') {
    showScreen('gameover');
    renderGameOver(state);
  }
}

function renderLobby(state) {
  document.getElementById('lobby-code').textContent = state.code;
  document.getElementById('lobby-player-count').textContent = state.players.length;

  const list = document.getElementById('lobby-player-list');
  list.innerHTML = '';
  state.players.forEach(p => {
    const li = document.createElement('li');
    li.className = 'player-chip';
    li.textContent = `${p.isHost ? '👑 ' : '🎨 '}${p.name}${p.id === myPlayerId ? ' (You)' : ''}`;
    list.appendChild(li);
  });

  const isHost = state.players.find(p => p.id === myPlayerId)?.isHost;
  document.getElementById('host-start-area').classList.toggle('hidden', !isHost);
  document.getElementById('guest-wait-msg').classList.toggle('hidden', !!isHost);

  const langCtrl = document.getElementById('lobby-lang-control');
  langCtrl.classList.toggle('hidden', !isHost);
  document.querySelectorAll('.lang-switch-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === state.language);
  });
}

function renderDrawingPhase(state) {
  if (currentRoundTracked !== state.currentRound) {
    currentRoundTracked = state.currentRound;
    activeWord = state.me?.selectedWord || null;
    strokes = [];
    currentStroke = null;
  }

  document.getElementById('draw-round-num').textContent = state.currentRound;
  document.getElementById('wait-round-num').textContent = state.currentRound;

  const finishedCount = state.roundFinishOrder.length;
  document.getElementById('finished-count-num').textContent = finishedCount;
  document.getElementById('current-penalty-num').textContent = finishedCount;

  const meObj = state.players.find(p => p.id === myPlayerId);
  const hasSubmitted = meObj?.hasFinishedRoundDrawing;

  const pickerPanel = document.getElementById('word-picker-panel');
  const canvasPanel = document.getElementById('blind-canvas-panel');
  const waitPanel = document.getElementById('draw-wait-panel');

  if (hasSubmitted) {
    pickerPanel.classList.add('hidden');
    canvasPanel.classList.add('hidden');
    waitPanel.classList.remove('hidden');

    const statusList = document.getElementById('draw-status-list');
    statusList.innerHTML = '';
    state.players.forEach(p => {
      const li = document.createElement('li');
      li.className = `player-chip ${p.hasFinishedRoundDrawing ? 'done' : ''}`;
      li.textContent = `${p.hasFinishedRoundDrawing ? '✅' : '✏️'} ${p.name}`;
      statusList.appendChild(li);
    });
    return;
  }

  waitPanel.classList.add('hidden');

  if (!activeWord) {
    pickerPanel.classList.remove('hidden');
    canvasPanel.classList.add('hidden');

    const wordsContainer = document.getElementById('my-words-list');
    wordsContainer.innerHTML = '';
    (state.me?.words || []).forEach(w => {
      const isUsed = (state.me?.usedWords || []).includes(w);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `word-btn ${isUsed ? 'used' : ''}`;
      btn.disabled = isUsed;
      btn.textContent = w;
      btn.addEventListener('click', () => {
        activeWord = w;
        strokes = [];
        sendAction('select_word', { word: w });
        renderDrawingPhase(currentRoomState);
      });
      wordsContainer.appendChild(btn);
    });
  } else {
    pickerPanel.classList.add('hidden');
    canvasPanel.classList.remove('hidden');
    document.getElementById('active-drawing-word').textContent = activeWord;
  }
}

function renderScoringPhase(state) {
  const isR1 = state.state === 'SCORING_1';
  document.getElementById('scoring-phase-badge').textContent = isR1
    ? 'SCORING ROUND 1 (NO HELP)'
    : 'SCORING ROUND 2 (WORD BANK)';
  document.getElementById('scoring-points-info').textContent = isR1
    ? '+2 pts per right guess (to you & artist)'
    : '+1 pt per right guess (to you & artist)';

  const painting = state.myAssignedPainting || [];
  renderCubistCanvas(document.getElementById('cubist-canvas'), painting, activeLayerFilter);

  const slotsContainer = document.getElementById('cubist-slots');
  slotsContainer.innerHTML = '';
  painting.forEach(d => {
    const div = document.createElement('div');
    const isGuessed = d.guessedRound1 || d.guessedRound2;
    div.className = `slot-pill ${d.color} ${isGuessed ? 'guessed' : ''}`;
    div.textContent = isGuessed
      ? `✓ ${d.word} (${d.rotation}°)`
      : `${d.color.toUpperCase()} (${d.rotation}°) — ?`;
    slotsContainer.appendChild(div);
  });

  const meObj = state.players.find(p => p.id === myPlayerId);
  const r1Panel = document.getElementById('scoring-r1-panel');
  const r2Panel = document.getElementById('scoring-r2-panel');
  const waitPanel = document.getElementById('scoring-wait-panel');

  const isDone = isR1 ? meObj?.hasFinishedScoring1 : meObj?.hasFinishedScoring2;

  if (isDone) {
    r1Panel.classList.add('hidden');
    r2Panel.classList.add('hidden');
    waitPanel.classList.remove('hidden');

    const list = document.getElementById('scoring-status-list');
    list.innerHTML = '';
    state.players.forEach(p => {
      const done = isR1 ? p.hasFinishedScoring1 : p.hasFinishedScoring2;
      const li = document.createElement('li');
      li.className = `player-chip ${done ? 'done' : ''}`;
      li.textContent = `${done ? '✅' : '🤔'} ${p.name}`;
      list.appendChild(li);
    });
    return;
  }

  waitPanel.classList.add('hidden');

  if (isR1) {
    r1Panel.classList.remove('hidden');
    r2Panel.classList.add('hidden');
  } else {
    r1Panel.classList.add('hidden');
    r2Panel.classList.remove('hidden');

    const unguessedCount = painting.filter(d => !d.guessedRound1 && !d.guessedRound2).length;
    document.getElementById('r2-needed-count').textContent = unguessedCount;

    const poolGrid = document.getElementById('r2-word-pool');
    poolGrid.innerHTML = '';

    const alreadyGuessedWords = painting.filter(d => d.guessedRound1).map(d => d.word);

    (state.allGameWords || []).forEach(word => {
      if (alreadyGuessedWords.includes(word)) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      const isSelected = r2SelectedWords.includes(word);
      btn.className = `pool-word-btn ${isSelected ? 'selected' : ''}`;
      btn.textContent = word;
      btn.addEventListener('click', () => {
        if (r2SelectedWords.includes(word)) {
          r2SelectedWords = r2SelectedWords.filter(w => w !== word);
        } else {
          if (r2SelectedWords.length >= unguessedCount) {
            r2SelectedWords.shift();
          }
          r2SelectedWords.push(word);
        }
        renderScoringPhase(currentRoomState);
      });
      poolGrid.appendChild(btn);
    });
  }
}

function renderGameOver(state) {
  const sorted = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
  const topScore = sorted[0]?.totalScore ?? 0;
  const winners = sorted.filter(p => p.totalScore === topScore).map(p => p.name);

  document.getElementById('winner-banner').textContent =
    winners.length > 1
      ? `🏆 Tie! ${winners.join(' & ')} Win!`
      : `🏆 ${winners[0]} Wins Qbism!`;

  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = '';
  sorted.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#${idx + 1}</strong></td>
      <td>${p.name}${p.id === myPlayerId ? ' <em>(You)</em>' : ''}</td>
      <td>+${p.guessPoints}</td>
      <td>+${p.artistPoints}</td>
      <td style="color: var(--red)">-${p.totalPenalty}</td>
      <td><strong style="color: var(--accent); font-size: 1.15rem">${p.totalScore}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  const isHost = state.players.find(p => p.id === myPlayerId)?.isHost;
  document.getElementById('host-replay-area').classList.toggle('hidden', !isHost);

  const galleryGrid = document.getElementById('gallery-grid');
  galleryGrid.innerHTML = '';
  (state.gallery || []).forEach(item => {
    const card = document.createElement('div');
    card.className = 'gallery-item';

    const title = document.createElement('h4');
    title.textContent = `Decoded by ${item.playerName}`;
    card.appendChild(title);

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    card.appendChild(canvas);
    renderCubistCanvas(canvas, item.drawings, 'all');

    const ul = document.createElement('ul');
    ul.className = 'gallery-legend';
    item.drawings.forEach(d => {
      const li = document.createElement('li');
      const status = d.guessedRound1 ? '✅ R1 (+2)' : d.guessedRound2 ? '☑️ R2 (+1)' : '❌ Missed';
      li.style.color = COLOR_HEX[d.color];
      li.innerHTML = `<strong>${d.word.toUpperCase()}</strong> (${d.rotation}°) — drawn by <em>${d.authorName}</em> [${status}]`;
      ul.appendChild(li);
    });
    card.appendChild(ul);
    galleryGrid.appendChild(card);
  });
}
