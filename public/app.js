const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000
});

// Persistent player ID across reloads and browser restarts
let myPlayerId = localStorage.getItem('qbism_player_id') || sessionStorage.getItem('qbism_player_id');
if (!myPlayerId) {
  myPlayerId = 'p_' + Math.random().toString(36).substring(2, 10);
}
localStorage.setItem('qbism_player_id', myPlayerId);
sessionStorage.setItem('qbism_player_id', myPlayerId);

let selectedCreateLang = 'en';
let currentRoomState = null;
let detectedHotspotUrl = window.location.origin;

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

function getContextPayload(extra = {}) {
  return {
    code: currentRoomState?.code || localStorage.getItem('qbism_room_code') || '',
    playerId: myPlayerId,
    ...extra
  };
}

// Auto-rejoin active room on page refresh or Socket.IO background reconnect (fixes Firefox for Android)
function attemptAutoRejoin() {
  const savedCode = localStorage.getItem('qbism_room_code');
  const savedName = localStorage.getItem('qbism_player_name') || 'Artist';
  if (!savedCode) return;

  socket.emit(
    'join_room',
    { code: savedCode, playerName: savedName, playerId: myPlayerId, isAutoReconnect: true },
    (res) => {
      if (res?.ok) {
        if (res.playerId && res.playerId !== myPlayerId) {
          myPlayerId = res.playerId;
          localStorage.setItem('qbism_player_id', myPlayerId);
          sessionStorage.setItem('qbism_player_id', myPlayerId);
        }
        localStorage.setItem('qbism_room_code', res.code);
      } else {
        // Room no longer exists on server -> clear saved code and stay on Home screen
        if (!currentRoomState) {
          localStorage.removeItem('qbism_room_code');
          roomBadge.classList.add('hidden');
          showScreen('home');
        }
      }
    }
  );
}

socket.on('connect', () => {
  attemptAutoRejoin();
});

// When Firefox for Android wakes up from background / screen lock, immediately resync
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!socket.connected) {
      socket.connect();
    } else if (localStorage.getItem('qbism_room_code')) {
      attemptAutoRejoin();
    }
  }
});

// Fetch Local Hotspot / Wi-Fi IP only when hosting on localhost; on Cloud/HTTPS use window.location.origin
async function fetchNetworkInfo() {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const hotspotBox = document.getElementById('hotspot-url-box');

  if (!isLocalhost) {
    detectedHotspotUrl = window.location.origin;
    if (hotspotBox) hotspotBox.classList.add('hidden');
    return;
  }

  try {
    const res = await fetch('/api/network');
    const data = await res.json();
    if (data?.primaryUrl) {
      detectedHotspotUrl = data.primaryUrl;
      const el = document.getElementById('hotspot-url-text');
      if (el) el.textContent = detectedHotspotUrl;
    }
  } catch {
    const el = document.getElementById('hotspot-url-text');
    if (el) el.textContent = window.location.origin;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  fetchNetworkInfo();

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

  // Leave Room button in top badge
  const leaveBtn = document.getElementById('btn-leave-room');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', () => {
      localStorage.removeItem('qbism_room_code');
      currentRoomState = null;
      currentRoundTracked = 0;
      activeWord = null;
      strokes = [];
      roomBadge.classList.add('hidden');
      showScreen('home');
      showToast('Left room');
    });
  }
});

// Language selection on Home screen
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedCreateLang = btn.dataset.lang;
  });
});

// Create Room
document.getElementById('btn-create').addEventListener('click', () => {
  const playerName = document.getElementById('player-name').value.trim() || 'Artist';
  localStorage.setItem('qbism_player_name', playerName);
  fetchNetworkInfo();
  socket.emit('create_room', { playerName, language: selectedCreateLang, playerId: myPlayerId }, (res) => {
    if (!res?.ok) return showToast(res?.error || 'Could not create room');
    localStorage.setItem('qbism_room_code', res.code);
  });
});

// Join Room (Note: on Hotspot, if only 1 room exists, even an empty code auto-joins!)
document.getElementById('btn-join').addEventListener('click', () => {
  const playerName = document.getElementById('player-name').value.trim() || 'Artist';
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  localStorage.setItem('qbism_player_name', playerName);
  socket.emit('join_room', { code, playerName, playerId: myPlayerId }, (res) => {
    if (!res?.ok) return showToast(res?.error || 'Could not join room');
    if (res.playerId && res.playerId !== myPlayerId) {
      myPlayerId = res.playerId;
      localStorage.setItem('qbism_player_id', myPlayerId);
      sessionStorage.setItem('qbism_player_id', myPlayerId);
    }
    localStorage.setItem('qbism_room_code', res.code);
  });
});

// Lobby language switch
document.querySelectorAll('.lang-switch-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    socket.emit('set_language', getContextPayload({ language: btn.dataset.lang }));
  });
});

// WhatsApp & Invite Link Sharing (Works for both Cloud Hosting and Local Hotspot!)
document.getElementById('btn-whatsapp').addEventListener('click', () => {
  if (!currentRoomState) return;
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const inviteUrl = `${detectedHotspotUrl}/?room=${currentRoomState.code}`;
  const text = isLocalhost
    ? `🎨 Connect to my Wi-Fi Hotspot and open:\n${inviteUrl}\n(Room Code: *${currentRoomState.code}*)`
    : `🎨 Join my Qbism game! Code: *${currentRoomState.code}*\nPlay here: ${inviteUrl}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
});

document.getElementById('btn-copy-link').addEventListener('click', async () => {
  if (!currentRoomState) return;
  const inviteUrl = `${detectedHotspotUrl}/?room=${currentRoomState.code}`;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    showToast(`Copied: ${inviteUrl}`);
  } catch {
    showToast(`Open: ${inviteUrl}`);
  }
});

// Start Game
document.getElementById('btn-start-game').addEventListener('click', () => {
  socket.emit('start_game', getContextPayload(), (res) => {
    if (!res?.ok) showToast(res?.error || 'Cannot start game');
  });
});

// Play Again
document.getElementById('btn-play-again').addEventListener('click', () => {
  socket.emit('play_again', getContextPayload());
});

// ==========================================
// BLIND DRAWING CANVAS (Mouse & Touch)
// ==========================================
function initBlindCanvas() {
  const canvas = document.getElementById('draw-canvas');
  const touchDot = document.getElementById('touch-dot');

  function getNormalizedPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const touch = (evt.touches && evt.touches[0]) || (evt.changedTouches && evt.changedTouches[0]);
    const clientX = touch ? touch.clientX : evt.clientX;
    const clientY = touch ? touch.clientY : evt.clientY;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)), px: clientX - rect.left, py: clientY - rect.top };
  }

  function startStroke(evt) {
    if (evt.touches && evt.touches.length === 0) return;
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
    if (evt.touches && evt.touches.length === 0) return;
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
  window.addEventListener('touchcancel', endStroke);

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
    socket.emit('submit_drawing', getContextPayload({ word: activeWord, strokes }), (res) => {
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
    socket.emit('finish_scoring_1', getContextPayload());
  });

  document.getElementById('btn-r2-submit').addEventListener('click', () => {
    socket.emit('submit_scoring_2', getContextPayload({ selectedWords: r2SelectedWords }), (res) => {
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
    socket.emit('submit_guess_r1', getContextPayload({ guessText }), (res) => {
      if (res?.correct) {
        showToast(`🎉 Correct! "${res.matchedWord.toUpperCase()}" (+2 pts to you & artist!)`);
      } else if (res?.error) {
        showToast(res.error);
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
socket.on('room_state', (state) => {
  const prevState = currentRoomState?.state;
  currentRoomState = state;

  if (state.code) {
    localStorage.setItem('qbism_room_code', state.code);
  }
  if (state.me?.id && state.me.id !== myPlayerId) {
    myPlayerId = state.me.id;
    localStorage.setItem('qbism_player_id', myPlayerId);
    sessionStorage.setItem('qbism_player_id', myPlayerId);
  }

  roomBadge.classList.remove('hidden');
  headerRoomCode.textContent = state.code;

  if (state.state === 'LOBBY') {
    currentRoundTracked = 0;
    activeWord = null;
    strokes = [];
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
});

function renderLobby(state) {
  document.getElementById('lobby-code').textContent = state.code;
  document.getElementById('lobby-player-count').textContent = state.players.length;
  document.getElementById('hotspot-url-text').textContent = `${detectedHotspotUrl}/?room=${state.code}`;

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
  } else if (!activeWord && state.me?.selectedWord) {
    activeWord = state.me.selectedWord;
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
        socket.emit('select_word', getContextPayload({ word: w }));
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
