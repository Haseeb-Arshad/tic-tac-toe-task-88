(() => {
  "use strict";

  const WIN_PATTERNS = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  const state = {
    board: Array(9).fill(null),
    currentPlayer: "X",
    startingPlayer: "X",
    gameActive: true,
    isAiThinking: false,
    mode: "ai",
    difficulty: "medium",
    scores: {
      X: 0,
      O: 0,
      draws: 0,
    },
    round: 1,
  };

  const elements = {
    modeSelect: document.getElementById("modeSelect"),
    difficultySelect: document.getElementById("difficultySelect"),
    difficultyGroup: document.getElementById("difficultyGroup"),
    statusMessage: document.getElementById("statusMessage"),
    roundLabel: document.getElementById("roundLabel"),
    scoreXLabel: document.getElementById("scoreXLabel"),
    scoreOLabel: document.getElementById("scoreOLabel"),
    scoreX: document.getElementById("scoreX"),
    scoreO: document.getElementById("scoreO"),
    scoreDraws: document.getElementById("scoreDraws"),
    newRoundBtn: document.getElementById("newRoundBtn"),
    resetMatchBtn: document.getElementById("resetMatchBtn"),
    cells: Array.from(document.querySelectorAll(".cell")),
  };

  function init() {
    if (!elements.cells.length) {
      console.error("Game board cells are missing from the DOM.");
      return;
    }

    bindEvents();
    syncControlsWithState();
    updateLabels();
    updateScoreboard();
    startRound({ preserveStarter: true });
  }

  function bindEvents() {
    elements.cells.forEach((cell) => {
      cell.addEventListener("click", onCellClick);
    });

    elements.modeSelect.addEventListener("change", (event) => {
      state.mode = event.target.value;
      resetMatch();
    });

    elements.difficultySelect.addEventListener("change", (event) => {
      state.difficulty = event.target.value;
      // If AI is about to play, let new difficulty apply immediately.
      if (isAITurn() && state.gameActive) {
        queueAIMove();
      }
    });

    elements.newRoundBtn.addEventListener("click", () => {
      if (state.isAiThinking) return;
      state.round += 1;
      state.startingPlayer = state.startingPlayer === "X" ? "O" : "X";
      startRound({ preserveStarter: true });
    });

    elements.resetMatchBtn.addEventListener("click", () => {
      resetMatch();
    });

    // Helpful keyboard shortcuts for fast testing.
    document.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "n") {
        elements.newRoundBtn.click();
      }
      if (event.key.toLowerCase() === "r") {
        elements.resetMatchBtn.click();
      }
    });
  }

  function syncControlsWithState() {
    elements.modeSelect.value = state.mode;
    elements.difficultySelect.value = state.difficulty;
    elements.difficultySelect.disabled = state.mode !== "ai";
    elements.difficultyGroup.style.opacity = state.mode === "ai" ? "1" : "0.55";
  }

  function updateLabels() {
    elements.scoreXLabel.textContent = state.mode === "ai" ? "You (X)" : "Player X";
    elements.scoreOLabel.textContent = state.mode === "ai" ? "Computer (O)" : "Player O";
    syncControlsWithState();
  }

  function updateScoreboard() {
    elements.scoreX.textContent = String(state.scores.X);
    elements.scoreO.textContent = String(state.scores.O);
    elements.scoreDraws.textContent = String(state.scores.draws);
    elements.roundLabel.textContent = `Round ${state.round}`;
  }

  function startRound({ preserveStarter }) {
    state.board = Array(9).fill(null);
    state.gameActive = true;
    state.isAiThinking = false;

    if (!preserveStarter) {
      state.startingPlayer = "X";
    }

    state.currentPlayer = state.startingPlayer;

    elements.cells.forEach((cell) => {
      cell.textContent = "";
      cell.classList.remove("marked-x", "marked-o", "winning-cell");
      cell.disabled = false;
      cell.setAttribute("aria-label", `Cell ${Number(cell.dataset.index) + 1}`);
    });

    updateStatus(turnMessage());

    if (isAITurn()) {
      queueAIMove();
    }
  }

  function onCellClick(event) {
    const target = event.currentTarget;
    const index = Number(target.dataset.index);

    if (!state.gameActive || state.isAiThinking || Number.isNaN(index)) {
      return;
    }

    if (state.board[index] !== null) {
      return;
    }

    handleMove(index, state.currentPlayer);
  }

  function handleMove(index, player) {
    state.board[index] = player;
    paintCell(index, player);

    const winInfo = getWinInfo(state.board);
    if (winInfo) {
      finishRound({ winner: player, winCells: winInfo.cells });
      return;
    }

    if (isBoardFull(state.board)) {
      finishRound({ winner: null, winCells: [] });
      return;
    }

    state.currentPlayer = player === "X" ? "O" : "X";
    updateStatus(turnMessage());

    if (isAITurn()) {
      queueAIMove();
    }
  }

  function paintCell(index, player) {
    const cell = elements.cells[index];
    if (!cell) return;

    cell.textContent = player;
    cell.disabled = true;
    cell.classList.add(player === "X" ? "marked-x" : "marked-o");
    cell.setAttribute("aria-label", `Cell ${index + 1}, ${player}`);
  }

  function finishRound({ winner, winCells }) {
    state.gameActive = false;
    state.isAiThinking = false;

    elements.cells.forEach((cell) => {
      cell.disabled = true;
    });

    if (winner) {
      state.scores[winner] += 1;
      winCells.forEach((idx) => {
        elements.cells[idx]?.classList.add("winning-cell");
      });
      updateStatus(winnerMessage(winner));
    } else {
      state.scores.draws += 1;
      updateStatus("It’s a draw! Press “New Round” for a rematch.");
    }

    updateScoreboard();
  }

  function resetMatch() {
    state.scores = { X: 0, O: 0, draws: 0 };
    state.round = 1;
    state.startingPlayer = "X";
    state.currentPlayer = "X";
    state.gameActive = true;
    state.isAiThinking = false;

    updateLabels();
    updateScoreboard();
    startRound({ preserveStarter: true });
  }

  function isAITurn() {
    return state.mode === "ai" && state.currentPlayer === "O" && state.gameActive;
  }

  function queueAIMove() {
    state.isAiThinking = true;
    updateStatus(`Computer is thinking (${state.difficulty})…`);

    window.setTimeout(() => {
      if (!state.gameActive || state.currentPlayer !== "O") {
        state.isAiThinking = false;
        return;
      }

      const move = chooseAIMove();
      state.isAiThinking = false;

      if (move !== null) {
        handleMove(move, "O");
      }
    }, 380);
  }

  function chooseAIMove() {
    const empty = getEmptyIndices(state.board);
    if (empty.length === 0) return null;

    if (state.difficulty === "easy") {
      return randomChoice(empty);
    }

    if (state.difficulty === "medium") {
      const winningMove = findImmediateWinningMove(state.board, "O");
      if (winningMove !== null) return winningMove;

      const blockMove = findImmediateWinningMove(state.board, "X");
      if (blockMove !== null) return blockMove;

      if (state.board[4] === null) return 4;

      const corners = [0, 2, 6, 8].filter((i) => state.board[i] === null);
      if (corners.length) return randomChoice(corners);

      return randomChoice(empty);
    }

    return bestMoveMinimax(state.board);
  }

  function bestMoveMinimax(board) {
    let bestScore = -Infinity;
    let move = null;

    for (const index of getEmptyIndices(board)) {
      board[index] = "O";
      const score = minimax(board, false, 0);
      board[index] = null;

      if (score > bestScore) {
        bestScore = score;
        move = index;
      }
    }

    return move;
  }

  function minimax(board, isMaximizing, depth) {
    const result = getWinInfo(board);
    if (result) {
      return result.winner === "O" ? 10 - depth : depth - 10;
    }
    if (isBoardFull(board)) {
      return 0;
    }

    if (isMaximizing) {
      let best = -Infinity;
      for (const idx of getEmptyIndices(board)) {
        board[idx] = "O";
        const score = minimax(board, false, depth + 1);
        board[idx] = null;
        best = Math.max(best, score);
      }
      return best;
    }

    let best = Infinity;
    for (const idx of getEmptyIndices(board)) {
      board[idx] = "X";
      const score = minimax(board, true, depth + 1);
      board[idx] = null;
      best = Math.min(best, score);
    }
    return best;
  }

  function findImmediateWinningMove(board, player) {
    for (const index of getEmptyIndices(board)) {
      board[index] = player;
      const didWin = getWinInfo(board)?.winner === player;
      board[index] = null;
      if (didWin) return index;
    }
    return null;
  }

  function getWinInfo(board) {
    for (const [a, b, c] of WIN_PATTERNS) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return {
          winner: board[a],
          cells: [a, b, c],
        };
      }
    }
    return null;
  }

  function getEmptyIndices(board) {
    const values = [];
    for (let i = 0; i < board.length; i += 1) {
      if (board[i] === null) values.push(i);
    }
    return values;
  }

  function isBoardFull(board) {
    return board.every((cell) => cell !== null);
  }

  function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)] ?? null;
  }

  function turnMessage() {
    if (state.mode === "ai") {
      return state.currentPlayer === "X" ? "Your turn (X)" : "Computer turn (O)";
    }
    return `Player ${state.currentPlayer}'s turn`;
  }

  function winnerMessage(winner) {
    if (state.mode === "ai") {
      return winner === "X"
        ? "You win this round!"
        : `Computer wins (${state.difficulty}). Try another round!`;
    }
    return `Player ${winner} wins this round!`;
  }

  function updateStatus(message) {
    elements.statusMessage.textContent = message;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
