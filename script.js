(() => {
  'use strict';

  const STORAGE_KEYS = {
    score: 'ttt_score_v1',
    history: 'ttt_history_v1',
    settings: 'ttt_settings_v1'
  };

  const appState = {
    board: Array(9).fill(''),
    currentPlayer: 'X',
    gameOver: false,
    mode: 'ai', // ai | pvp | online
    difficulty: 'medium', // easy | medium | hard
    theme: 'clean',
    soundOn: true,
    score: { X: 0, O: 0, draws: 0 },
    history: [],
    moveLog: [],
    replaying: false,
    // online
    clientId: `c_${Math.random().toString(36).slice(2, 10)}`,
    roomCode: '',
    onlineRole: null, // host -> X, guest -> O
    onlineConnected: false,
    channel: null,
    channelSupported: typeof window !== 'undefined' && 'BroadcastChannel' in window
  };

  const ui = {};

  function safeJSONParse(input, fallback) {
    try {
      return JSON.parse(input);
    } catch (_) {
      return fallback;
    }
  }

  function loadStoredData() {
    try {
      const storedScore = localStorage.getItem(STORAGE_KEYS.score);
      const storedHistory = localStorage.getItem(STORAGE_KEYS.history);
      const storedSettings = localStorage.getItem(STORAGE_KEYS.settings);

      if (storedScore) {
        const parsed = safeJSONParse(storedScore, null);
        if (parsed && typeof parsed === 'object') {
          appState.score = {
            X: Number(parsed.X) || 0,
            O: Number(parsed.O) || 0,
            draws: Number(parsed.draws) || 0
          };
        }
      }

      if (storedHistory) {
        const parsed = safeJSONParse(storedHistory, []);
        if (Array.isArray(parsed)) appState.history = parsed.slice(0, 25);
      }

      if (storedSettings) {
        const parsed = safeJSONParse(storedSettings, null);
        if (parsed && typeof parsed === 'object') {
          if (parsed.theme) appState.theme = parsed.theme;
          if (typeof parsed.soundOn === 'boolean') appState.soundOn = parsed.soundOn;
          if (parsed.mode) appState.mode = parsed.mode;
          if (parsed.difficulty) appState.difficulty = parsed.difficulty;
        }
      }
    } catch (_) {
      // localStorage may be disabled; continue in memory only
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEYS.score, JSON.stringify(appState.score));
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(appState.history.slice(0, 25)));
      localStorage.setItem(
        STORAGE_KEYS.settings,
        JSON.stringify({
          theme: appState.theme,
          soundOn: appState.soundOn,
          mode: appState.mode,
          difficulty: appState.difficulty
        })
      );
    } catch (_) {
      // fail silently
    }
  }

  function ensureMarkup() {
    let root = document.getElementById('ttt-root');
    if (!root) {
      root = document.createElement('main');
      root.id = 'ttt-root';
      document.body.appendChild(root);
    }
    root.className = 'ttt-root';

    // If required structure is missing, inject complete resilient shell.
    if (!root.querySelector('#board') || !root.querySelector('#status')) {
      root.innerHTML = `
        <section class="panel game-panel" aria-labelledby="ttt-title">
          <header>
            <h1 id="ttt-title">Tic-Tac-Toe</h1>
            <p class="subtitle">Fast rounds, keyboard friendly, and stable in every modern browser.</p>
          </header>

          <div class="controls-grid" aria-label="Game controls">
            <div class="field">
              <label for="modeSelect">Mode</label>
              <select id="modeSelect" aria-label="Select game mode">
                <option value="ai">Player vs AI</option>
                <option value="pvp">Player vs Player</option>
                <option value="online">Online (two tabs)</option>
              </select>
            </div>
            <div class="field" id="difficultyField">
              <label for="difficultySelect">AI Difficulty</label>
              <select id="difficultySelect" aria-label="Select AI difficulty">
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard (unbeatable)</option>
              </select>
            </div>
            <div class="field">
              <label for="themeSelect">Theme</label>
              <select id="themeSelect" aria-label="Select theme">
                <option value="clean">Clean</option>
                <option value="midnight">Midnight</option>
                <option value="forest">Forest</option>
              </select>
            </div>
            <div class="field">
              <label class="switch-wrap" for="soundToggle">
                <input id="soundToggle" type="checkbox" checked />
                Sound effects
              </label>
            </div>
          </div>

          <div id="onlinePanel" class="online-row hidden" aria-label="Online controls">
            <input id="roomCodeInput" type="text" maxlength="12" placeholder="Room code" aria-label="Room code" />
            <button id="createRoomBtn" class="secondary" type="button">Create Room</button>
            <button id="joinRoomBtn" class="secondary" type="button">Join Room</button>
            <button id="leaveRoomBtn" class="ghost" type="button">Leave</button>
          </div>

          <p id="status" class="status" role="status" aria-live="polite"></p>

          <div id="board" class="board" role="grid" aria-label="Tic tac toe board"></div>

          <div class="action-row">
            <button id="newRoundBtn" type="button">New Round</button>
            <button id="resetMatchBtn" class="secondary" type="button">Reset Match</button>
          </div>
        </section>

        <aside class="panel side-panel" aria-label="Game statistics and history">
          <section>
            <h2>Scoreboard</h2>
            <div class="metrics">
              <article class="metric" aria-label="X wins">
                <h3>X Wins</h3>
                <p id="scoreX">0</p>
              </article>
              <article class="metric" aria-label="O wins">
                <h3>O Wins</h3>
                <p id="scoreO">0</p>
              </article>
              <article class="metric" aria-label="Draws">
                <h3>Draws</h3>
                <p id="scoreDraws">0</p>
              </article>
            </div>
          </section>

          <section>
            <h2>Recent Games</h2>
            <ul id="historyList" class="history-list" aria-live="polite"></ul>
          </section>
        </aside>
      `;
    }

    ui.root = root;
    ui.board = root.querySelector('#board');
    ui.status = root.querySelector('#status');
    ui.modeSelect = root.querySelector('#modeSelect');
    ui.difficultySelect = root.querySelector('#difficultySelect');
    ui.difficultyField = root.querySelector('#difficultyField');
    ui.themeSelect = root.querySelector('#themeSelect');
    ui.soundToggle = root.querySelector('#soundToggle');
    ui.newRoundBtn = root.querySelector('#newRoundBtn');
    ui.resetMatchBtn = root.querySelector('#resetMatchBtn');
    ui.historyList = root.querySelector('#historyList');
    ui.scoreX = root.querySelector('#scoreX');
    ui.scoreO = root.querySelector('#scoreO');
    ui.scoreDraws = root.querySelector('#scoreDraws');
    ui.onlinePanel = root.querySelector('#onlinePanel');
    ui.roomCodeInput = root.querySelector('#roomCodeInput');
    ui.createRoomBtn = root.querySelector('#createRoomBtn');
    ui.joinRoomBtn = root.querySelector('#joinRoomBtn');
    ui.leaveRoomBtn = root.querySelector('#leaveRoomBtn');

    if (ui.board && ui.board.children.length < 9) {
      ui.board.innerHTML = '';
      for (let i = 0; i < 9; i += 1) {
        const cell = document.createElement('button');
        cell.className = 'cell';
        cell.type = 'button';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', `Cell ${i + 1}`);
        cell.dataset.index = String(i);
        ui.board.appendChild(cell);
      }
    }

    ui.cells = Array.from(ui.board.querySelectorAll('.cell'));
  }

  function setTheme(theme) {
    appState.theme = theme;
    const body = document.body;
    body.dataset.theme = theme === 'clean' ? '' : theme;
  }

  function setStatus(message, level = 'normal') {
    if (!ui.status) return;
    ui.status.textContent = message;
    ui.status.dataset.level = level;
  }

  function updateScoreUI() {
    if (ui.scoreX) ui.scoreX.textContent = String(appState.score.X);
    if (ui.scoreO) ui.scoreO.textContent = String(appState.score.O);
    if (ui.scoreDraws) ui.scoreDraws.textContent = String(appState.score.draws);
  }

  function renderBoard(disableAll = false) {
    ui.cells.forEach((cell, index) => {
      const mark = appState.board[index];
      cell.textContent = mark;
      cell.dataset.mark = mark;
      const hasMark = mark !== '';
      const disabledByOnlineTurn = appState.mode === 'online' && !isMyTurnOnline();
      cell.disabled = disableAll || appState.gameOver || hasMark || appState.replaying || disabledByOnlineTurn;
    });
  }

  function clearWinStyles() {
    ui.cells.forEach((cell) => cell.classList.remove('win'));
  }

  function getWinner(board) {
    const wins = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6]
    ];

    for (let i = 0; i < wins.length; i += 1) {
      const [a, b, c] = wins[i];
      if (board[a] && board[a] === board[b] && board[b] === board[c]) {
        return { winner: board[a], line: wins[i] };
      }
    }

    const isDraw = board.every((cell) => cell !== '');
    return isDraw ? { winner: 'draw', line: null } : null;
  }

  function playTone(type) {
    if (!appState.soundOn) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = 0.02;

      if (type === 'win') osc.frequency.value = 620;
      else if (type === 'draw') osc.frequency.value = 360;
      else osc.frequency.value = 460;

      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      osc.stop(ctx.currentTime + 0.15);
      setTimeout(() => ctx.close().catch(() => {}), 250);
    } catch (_) {
      // audio blocked or unsupported
    }
  }

  function saveRoundToHistory(result) {
    const entry = {
      id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: new Date().toISOString(),
      mode: appState.mode,
      difficulty: appState.difficulty,
      result,
      moves: appState.moveLog.slice(0, 9)
    };
    appState.history.unshift(entry);
    appState.history = appState.history.slice(0, 25);
    renderHistory();
    persist();
  }

  function endRound(outcome) {
    appState.gameOver = true;

    if (outcome.winner === 'draw') {
      appState.score.draws += 1;
      setStatus('Draw. Great defense from both sides.', 'warning');
      playTone('draw');
      saveRoundToHistory('draw');
    } else {
      appState.score[outcome.winner] += 1;
      if (outcome.line) {
        outcome.line.forEach((i) => ui.cells[i].classList.add('win'));
      }
      setStatus(`Player ${outcome.winner} wins this round!`, 'success');
      playTone('win');
      saveRoundToHistory(outcome.winner);
    }

    updateScoreUI();
    renderBoard(true);
    persist();

    if (appState.mode === 'online') {
      publishOnlineState('sync');
    }
  }

  function switchPlayer() {
    appState.currentPlayer = appState.currentPlayer === 'X' ? 'O' : 'X';
  }

  function humanLabel() {
    if (appState.mode === 'ai') {
      return appState.currentPlayer === 'X' ? 'Your turn (X)' : `AI thinking (${appState.difficulty})...`;
    }
    if (appState.mode === 'online') {
      if (!appState.onlineConnected) return 'Online mode: create or join a room.';
      if (!isMyTurnOnline()) return 'Waiting for opponent move...';
      return `Your turn (${appState.onlineRole === 'host' ? 'X' : 'O'})`;
    }
    return `Player ${appState.currentPlayer}'s turn`;
  }

  function maybeUpdateStatusTurn() {
    if (!appState.gameOver) setStatus(humanLabel());
  }

  function isMyTurnOnline() {
    if (appState.mode !== 'online') return true;
    if (!appState.onlineConnected || !appState.onlineRole) return false;
    return (
      (appState.onlineRole === 'host' && appState.currentPlayer === 'X') ||
      (appState.onlineRole === 'guest' && appState.currentPlayer === 'O')
    );
  }

  function makeMove(index, source = 'human') {
    if (appState.gameOver || appState.replaying) return false;
    if (index < 0 || index > 8) return false;
    if (appState.board[index]) return false;

    if (appState.mode === 'online' && source !== 'remote' && !isMyTurnOnline()) {
      setStatus('Not your turn yet.', 'warning');
      return false;
    }

    appState.board[index] = appState.currentPlayer;
    appState.moveLog.push({ index, player: appState.currentPlayer });
    playTone('move');
    renderBoard();

    const outcome = getWinner(appState.board);
    if (outcome) {
      endRound(outcome);
      return true;
    }

    switchPlayer();
    maybeUpdateStatusTurn();
    renderBoard();

    if (appState.mode === 'ai' && appState.currentPlayer === 'O' && source !== 'ai') {
      window.setTimeout(() => {
        if (!appState.gameOver) {
          const aiMove = getAIMove(appState.board.slice(), appState.difficulty);
          if (typeof aiMove === 'number') makeMove(aiMove, 'ai');
        }
      }, 320);
    }

    if (appState.mode === 'online' && source !== 'remote') {
      publishOnlineState('move');
    }

    return true;
  }

  function getRandomEmptyCell(board) {
    const available = [];
    board.forEach((v, i) => {
      if (!v) available.push(i);
    });
    if (!available.length) return null;
    return available[Math.floor(Math.random() * available.length)];
  }

  function findWinningMove(board, player) {
    for (let i = 0; i < board.length; i += 1) {
      if (!board[i]) {
        board[i] = player;
        const win = getWinner(board);
        board[i] = '';
        if (win && win.winner === player) return i;
      }
    }
    return null;
  }

  function getMediumMove(board) {
    const winMove = findWinningMove(board, 'O');
    if (winMove !== null) return winMove;

    const blockMove = findWinningMove(board, 'X');
    if (blockMove !== null) return blockMove;

    if (!board[4]) return 4;

    const corners = [0, 2, 6, 8].filter((i) => !board[i]);
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)];

    return getRandomEmptyCell(board);
  }

  function minimax(board, isMaximizing) {
    const result = getWinner(board);
    if (result) {
      if (result.winner === 'O') return 10;
      if (result.winner === 'X') return -10;
      return 0;
    }

    if (isMaximizing) {
      let best = -Infinity;
      for (let i = 0; i < board.length; i += 1) {
        if (!board[i]) {
          board[i] = 'O';
          const score = minimax(board, false);
          board[i] = '';
          best = Math.max(best, score);
        }
      }
      return best;
    }

    let best = Infinity;
    for (let i = 0; i < board.length; i += 1) {
      if (!board[i]) {
        board[i] = 'X';
        const score = minimax(board, true);
        board[i] = '';
        best = Math.min(best, score);
      }
    }
    return best;
  }

  function getHardMove(board) {
    let bestScore = -Infinity;
    let move = null;

    for (let i = 0; i < board.length; i += 1) {
      if (!board[i]) {
        board[i] = 'O';
        const score = minimax(board, false);
        board[i] = '';
        if (score > bestScore) {
          bestScore = score;
          move = i;
        }
      }
    }

    return move;
  }

  function getAIMove(board, difficulty) {
    if (difficulty === 'easy') return getRandomEmptyCell(board);
    if (difficulty === 'medium') return getMediumMove(board);
    return getHardMove(board);
  }

  function resetRound(preserveStarter = false) {
    appState.board = Array(9).fill('');
    appState.moveLog = [];
    appState.gameOver = false;
    clearWinStyles();

    if (!preserveStarter) appState.currentPlayer = 'X';

    renderBoard();
    maybeUpdateStatusTurn();

    if (appState.mode === 'ai' && appState.currentPlayer === 'O') {
      window.setTimeout(() => {
        const aiMove = getAIMove(appState.board.slice(), appState.difficulty);
        if (typeof aiMove === 'number') makeMove(aiMove, 'ai');
      }, 220);
    }

    if (appState.mode === 'online') {
      publishOnlineState('reset');
    }
  }

  function resetMatch() {
    appState.score = { X: 0, O: 0, draws: 0 };
    appState.history = [];
    updateScoreUI();
    renderHistory();
    resetRound();
    setStatus('Match reset. Fresh start!');
    persist();
  }

  function renderHistory() {
    if (!ui.historyList) return;
    ui.historyList.innerHTML = '';

    if (!appState.history.length) {
      const empty = document.createElement('li');
      empty.className = 'history-item';
      empty.innerHTML = '<small>No games yet — play your first round!</small>';
      ui.historyList.appendChild(empty);
      return;
    }

    appState.history.slice(0, 12).forEach((item) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      const date = new Date(item.date);
      const label = item.result === 'draw' ? 'Draw' : `${item.result} won`;
      const mode = item.mode === 'ai' ? `AI/${item.difficulty}` : item.mode;

      const info = document.createElement('div');
      info.innerHTML = `<strong>${label}</strong><br /><small>${mode} • ${date.toLocaleString()}</small>`;

      const replayBtn = document.createElement('button');
      replayBtn.type = 'button';
      replayBtn.className = 'secondary';
      replayBtn.textContent = 'Replay';
      replayBtn.addEventListener('click', () => replayHistory(item.id));

      li.appendChild(info);
      li.appendChild(replayBtn);
      ui.historyList.appendChild(li);
    });
  }

  function replayHistory(id) {
    const game = appState.history.find((h) => h.id === id);
    if (!game || !Array.isArray(game.moves) || !game.moves.length) {
      setStatus('No replay data for this game.', 'warning');
      return;
    }

    appState.replaying = true;
    appState.board = Array(9).fill('');
    appState.currentPlayer = 'X';
    appState.gameOver = false;
    clearWinStyles();
    renderBoard(true);
    setStatus('Replaying saved game...');

    let step = 0;
    const timer = window.setInterval(() => {
      if (step >= game.moves.length) {
        clearInterval(timer);
        appState.replaying = false;
        const result = getWinner(appState.board);
        if (result && result.line) result.line.forEach((i) => ui.cells[i].classList.add('win'));
        appState.gameOver = !!result;
        if (result) {
          if (result.winner === 'draw') setStatus('Replay complete: draw.');
          else setStatus(`Replay complete: ${result.winner} won.`, 'success');
        }
        renderBoard();
        return;
      }

      const move = game.moves[step];
      if (move && typeof move.index === 'number' && (move.player === 'X' || move.player === 'O')) {
        appState.board[move.index] = move.player;
        appState.currentPlayer = move.player === 'X' ? 'O' : 'X';
        renderBoard(true);
      }
      step += 1;
    }, 380);
  }

  function setupBoardEvents() {
    ui.cells.forEach((cell) => {
      cell.addEventListener('click', () => {
        const index = Number(cell.dataset.index);
        if (!Number.isInteger(index)) return;
        makeMove(index, 'human');
      });

      // Keyboard arrow navigation for explicit accessibility polish.
      cell.addEventListener('keydown', (event) => {
        const index = Number(cell.dataset.index);
        if (!Number.isInteger(index)) return;

        let target = null;
        switch (event.key) {
          case 'ArrowRight':
            target = index % 3 === 2 ? index - 2 : index + 1;
            break;
          case 'ArrowLeft':
            target = index % 3 === 0 ? index + 2 : index - 1;
            break;
          case 'ArrowDown':
            target = index + 3 > 8 ? index - 6 : index + 3;
            break;
          case 'ArrowUp':
            target = index - 3 < 0 ? index + 6 : index - 3;
            break;
          default:
            break;
        }

        if (target !== null) {
          event.preventDefault();
          ui.cells[target].focus();
        }
      });
    });
  }

  function closeOnlineChannel() {
    if (appState.channel) {
      try {
        appState.channel.close();
      } catch (_) {
        // ignore close errors
      }
    }
    appState.channel = null;
    appState.onlineConnected = false;
    appState.onlineRole = null;
    appState.roomCode = '';
    if (ui.roomCodeInput) ui.roomCodeInput.value = '';
  }

  function handleOnlineMessage(payload) {
    if (!payload || payload.senderId === appState.clientId) return;
    if (payload.type === 'hello' && appState.onlineRole === 'host') {
      appState.onlineConnected = true;
      publishOnlineState('sync');
      setStatus('Opponent connected. Your turn as X.');
      renderBoard();
      return;
    }

    if (payload.type === 'sync' && payload.state) {
      applyOnlineState(payload.state);
      return;
    }

    if (payload.type === 'move' || payload.type === 'reset') {
      if (payload.state) applyOnlineState(payload.state);
    }

    if (payload.type === 'leave') {
      appState.onlineConnected = false;
      setStatus('Opponent left the room.', 'warning');
      renderBoard();
    }
  }

  function applyOnlineState(remote) {
    if (!remote || typeof remote !== 'object') return;
    appState.board = Array.isArray(remote.board) ? remote.board.slice(0, 9) : appState.board;
    appState.currentPlayer = remote.currentPlayer === 'O' ? 'O' : 'X';
    appState.gameOver = !!remote.gameOver;
    appState.moveLog = Array.isArray(remote.moveLog) ? remote.moveLog.slice(0, 9) : appState.moveLog;

    clearWinStyles();
    const outcome = getWinner(appState.board);
    if (outcome && outcome.line) outcome.line.forEach((i) => ui.cells[i].classList.add('win'));

    if (outcome) {
      if (outcome.winner === 'draw') setStatus('Draw in online match.', 'warning');
      else setStatus(`Player ${outcome.winner} wins online match.`, 'success');
    } else {
      maybeUpdateStatusTurn();
    }

    appState.onlineConnected = true;
    renderBoard();
  }

  function publishOnlineState(type) {
    if (!appState.channel) return;
    const payload = {
      type,
      senderId: appState.clientId,
      state: {
        board: appState.board,
        currentPlayer: appState.currentPlayer,
        gameOver: appState.gameOver,
        moveLog: appState.moveLog
      }
    };
    try {
      appState.channel.postMessage(payload);
    } catch (_) {
      // ignore
    }
  }

  function openOnlineRoom(code, role) {
    if (!appState.channelSupported) {
      setStatus('Online mode is unavailable in this browser.', 'danger');
      return;
    }

    closeOnlineChannel();

    appState.roomCode = code;
    appState.onlineRole = role;
    appState.onlineConnected = role === 'host';

    appState.channel = new BroadcastChannel(`ttt_room_${code}`);
    appState.channel.onmessage = (event) => handleOnlineMessage(event.data);

    if (role === 'guest') {
      appState.channel.postMessage({ type: 'hello', senderId: appState.clientId });
      setStatus('Joined room. Waiting for host sync...');
    } else {
      setStatus(`Room ${code} created. Open another tab and join.`, 'warning');
    }

    appState.currentPlayer = 'X';
    appState.board = Array(9).fill('');
    appState.moveLog = [];
    appState.gameOver = false;
    clearWinStyles();
    renderBoard();
  }

  function randomRoomCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function bindEvents() {
    setupBoardEvents();

    if (ui.modeSelect) {
      ui.modeSelect.addEventListener('change', () => {
        appState.mode = ui.modeSelect.value;
        const showDifficulty = appState.mode === 'ai';
        const showOnline = appState.mode === 'online';

        if (ui.difficultyField) ui.difficultyField.classList.toggle('hidden', !showDifficulty);
        if (ui.onlinePanel) ui.onlinePanel.classList.toggle('hidden', !showOnline);

        if (!showOnline) closeOnlineChannel();
        resetRound();
        persist();
      });
    }

    if (ui.difficultySelect) {
      ui.difficultySelect.addEventListener('change', () => {
        appState.difficulty = ui.difficultySelect.value;
        setStatus(`Difficulty set to ${appState.difficulty}.`);
        resetRound();
        persist();
      });
    }

    if (ui.themeSelect) {
      ui.themeSelect.addEventListener('change', () => {
        setTheme(ui.themeSelect.value);
        persist();
      });
    }

    if (ui.soundToggle) {
      ui.soundToggle.addEventListener('change', () => {
        appState.soundOn = !!ui.soundToggle.checked;
        persist();
      });
    }

    if (ui.newRoundBtn) ui.newRoundBtn.addEventListener('click', () => resetRound());
    if (ui.resetMatchBtn) ui.resetMatchBtn.addEventListener('click', resetMatch);

    if (ui.createRoomBtn) {
      ui.createRoomBtn.addEventListener('click', () => {
        const code = randomRoomCode();
        if (ui.roomCodeInput) ui.roomCodeInput.value = code;
        openOnlineRoom(code, 'host');
      });
    }

    if (ui.joinRoomBtn) {
      ui.joinRoomBtn.addEventListener('click', () => {
        const code = (ui.roomCodeInput?.value || '').trim().toUpperCase();
        if (!code) {
          setStatus('Please enter a room code first.', 'warning');
          return;
        }
        openOnlineRoom(code, 'guest');
      });
    }

    if (ui.leaveRoomBtn) {
      ui.leaveRoomBtn.addEventListener('click', () => {
        if (appState.channel) {
          try {
            appState.channel.postMessage({ type: 'leave', senderId: appState.clientId });
          } catch (_) {
            // ignore
          }
        }
        closeOnlineChannel();
        resetRound();
        setStatus('Left online room.');
      });
    }

    window.addEventListener('beforeunload', () => {
      if (appState.channel) {
        try {
          appState.channel.postMessage({ type: 'leave', senderId: appState.clientId });
        } catch (_) {
          // ignore
        }
      }
    });
  }

  function initUIFromState() {
    if (ui.modeSelect) ui.modeSelect.value = appState.mode;
    if (ui.difficultySelect) ui.difficultySelect.value = appState.difficulty;
    if (ui.themeSelect) ui.themeSelect.value = appState.theme;
    if (ui.soundToggle) ui.soundToggle.checked = appState.soundOn;

    if (ui.difficultyField) ui.difficultyField.classList.toggle('hidden', appState.mode !== 'ai');
    if (ui.onlinePanel) ui.onlinePanel.classList.toggle('hidden', appState.mode !== 'online');

    setTheme(appState.theme);
    updateScoreUI();
    renderHistory();
    renderBoard();
    maybeUpdateStatusTurn();
  }

  function init() {
    loadStoredData();
    ensureMarkup();
    bindEvents();
    initUIFromState();

    if (appState.mode === 'ai' && appState.currentPlayer === 'O') {
      const aiMove = getAIMove(appState.board.slice(), appState.difficulty);
      if (typeof aiMove === 'number') makeMove(aiMove, 'ai');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
