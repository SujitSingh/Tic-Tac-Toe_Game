export default class TicTacToeGameClient {
  constructor() {
    this.socket = io();

    // DOM elements
    this.dom = {
      lobbyDiv: document.getElementById('lobby'),
      gameDiv: document.getElementById('game-container'),
      startActionsDiv: document.getElementById('start-actions'),
      cancelActionsDiv: document.getElementById('cancel-actions'),
      cpuDifficultySelect: document.getElementById('cpu-difficulty'),
      difficultyValue: document.getElementById('difficulty-value'),
      startMatchBtn: document.getElementById('start-match-search'),
      startCpuMatchBtn: document.getElementById('start-cpu-match'),
      cancelGameSearchBtn: document.getElementById('cancel-game-search'),
      gameBoardDiv: document.getElementById('game-board'),
      playerInfo: document.getElementById('player-info'),
      turnInfo: document.getElementById('turn-info'),
      roomDisplay: document.getElementById('room-display'),
      resetBtn: document.getElementById('reset-btn'),
      resignBtn: document.getElementById('resign-btn'),
      gameToLobbyBtn: document.getElementById('game-to-lobby-btn'),
      timerDisplay: document.getElementById('timer-display'),
      resultsDiv: document.getElementById('results'),
      resultMessage: document.getElementById('result-message'),
      backToLobbyBtn: document.getElementById('back-to-lobby-btn'),
      cells: document.querySelectorAll('.cell'),
    };

    // game states
    this.myPlayer = null;
    this.currentRoomId = null;
    this.isMyTurn = false;
    this.countdownInterval = null;

    this.initGameEventListeners();
    this.initSocketListeners();

    const pathRoomId = window.location.pathname.substring(1);
    if (pathRoomId) {
      const roomId = decodeURIComponent(pathRoomId);
      // join same room on page reload
      this.socket.emit('join_room', roomId, (data) => this.handleRoomAssignment(data));
    }
  }

  initGameEventListeners() {
    this.dom.startMatchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.dom.startActionsDiv.classList.add('hidden');
      this.dom.cancelActionsDiv.classList.remove('hidden');

      this.socket.emit('search_match', (data) => this.handleRoomAssignment(data));
    });

    this.dom.cpuDifficultySelect.addEventListener('input', (e) => {
      this.dom.difficultyValue.textContent = e.target.value;
    });

    this.dom.startCpuMatchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.dom.startActionsDiv.classList.add('hidden');
      this.dom.cancelActionsDiv.classList.remove('hidden');

      const cpuDifficulty = parseInt(this.dom.cpuDifficultySelect.value, 10);

      this.socket.emit('start_cpu_game', { cpuDifficulty }, (data) => this.handleRoomAssignment(data));
    });

    this.dom.cancelGameSearchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.currentRoomId) {
        this.socket.emit('cancel_search', this.currentRoomId);
      }
      this.currentRoomId = null;
      this.dom.cancelActionsDiv.classList.add('hidden');
      this.dom.startActionsDiv.classList.remove('hidden');
    });

    this.dom.gameBoardDiv.addEventListener('click', (e) => {
      if (!this.isMyTurn) return;

      const cell = e.target;
      if (cell.classList.contains('cell') && !cell.textContent) {
        const index = parseInt(cell.getAttribute('data-index'));

        this.socket.emit('player_move', { roomId: this.currentRoomId, index });
      }
    });

    this.dom.resetBtn.addEventListener('click', () => {
      this.socket.emit('reset_game', this.currentRoomId);
    });

    this.dom.resignBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to resign?')) {
        this.socket.emit('resign_game', { roomId: this.currentRoomId });
      }
    });

    this.dom.gameToLobbyBtn.addEventListener('click', () => {
      if (this.currentRoomId) {
        this.socket.emit('leave_room', this.currentRoomId);
      }
      this.dom.gameDiv.classList.add('hidden');
      this.dom.resultsDiv.classList.add('hidden');
      this.dom.lobbyDiv.classList.remove('hidden');
      this.currentRoomId = null;
      this.myPlayer = null;

      window.history.pushState(null, '', '/');
    });

    this.dom.backToLobbyBtn.addEventListener('click', () => {
      if (this.currentRoomId) {
        this.socket.emit('leave_room', this.currentRoomId);
      }
      this.dom.resultsDiv.classList.add('hidden');
      this.dom.lobbyDiv.classList.remove('hidden');
      this.currentRoomId = null;
      this.myPlayer = null;

      window.history.pushState(null, '', '/');
    });
  }

  initSocketListeners() {
    this.socket.on('game_state', (gameState) => {
      this.stopCountdown();
      this.updateBoard(gameState.board, gameState.winningLine);
      this.updateStatus(gameState);
    });

    this.socket.on('opponent_left', ({ timeout }) => {
      this.startCountdown(timeout);
    });

    this.socket.on('game_end_timeout', (message) => {
      this.stopCountdown();
      this.dom.gameBoardDiv.classList.add('disabled');
      this.dom.resignBtn.classList.add('hidden');
      this.dom.gameToLobbyBtn.classList.remove('hidden');

      this.dom.turnInfo.textContent = message;
    });

    this.socket.on('error', (data) => {
      const { message, reload, toHome } = data || {};

      this.stopCountdown();
      if (message) alert(message);

      if (toHome) {
        window.location.href = '/';
      } else if (reload) {
        window.location.reload();
      }
    });
  }

  handleRoomAssignment({ player, roomId }) {
    this.myPlayer = player;
    this.currentRoomId = roomId;
    this.dom.roomDisplay.textContent = `Room: ${roomId}`;
    this.dom.playerInfo.textContent = `You are Player: ${player}`;
  }

  updateBoard(board, winningLine) {
    this.dom.cells.forEach((cell, index) => {
      const value = board[index];
      cell.textContent = value || '';
      cell.classList.remove('X', 'O', 'win');
      if (value) {
        cell.classList.add(value);
      }
      if (winningLine && winningLine.includes(index)) {
        cell.classList.add('win');
      }
    });
  }

  updateStatus(gameState) {
    const { turn, winner, endReason, playerCount, ready } = gameState;

    if (playerCount > 1 && !this.dom.lobbyDiv.classList.contains('hidden')) {
      this.dom.lobbyDiv.classList.add('hidden');
      this.dom.gameDiv.classList.remove('hidden');
      this.dom.startActionsDiv.classList.remove('hidden');
      this.dom.cancelActionsDiv.classList.add('hidden');

      if (window.location.pathname === '/') {
        window.history.pushState(null, '', `/${encodeURIComponent(this.currentRoomId)}`);
      }
    }

    if (winner) {
      this.isMyTurn = false;
      this.dom.gameBoardDiv.classList.add('disabled');
      this.dom.resignBtn.classList.add('hidden');
      this.dom.gameToLobbyBtn.classList.remove('hidden');

      if (playerCount < 2) {
        this.dom.resetBtn.classList.add('hidden');
      } else {
        this.dom.resetBtn.classList.remove('hidden');
      }

      if (winner === 'Draw') {
        this.dom.turnInfo.textContent = "Game Over: It's a Draw!";
        this.dom.turnInfo.style.color = 'orange';
      } else {
        const isWinner = winner === this.myPlayer;
        let reasonText = '';
        if (endReason === 'Resignation') {
          reasonText = isWinner ? '(Opponent Resigned)' : '(You Resigned)';
        }

        this.dom.turnInfo.textContent = isWinner ? `You Won! ${reasonText}` : `You Lost! ${reasonText}`;
        this.dom.turnInfo.style.color = isWinner ? '#61dafb' : '#ff6b6b';
      }
    } else {
      this.dom.resetBtn.classList.add('hidden');
      this.dom.resignBtn.classList.remove('hidden');
      this.dom.gameToLobbyBtn.classList.add('hidden');
      this.isMyTurn = turn === this.myPlayer;

      if (this.isMyTurn) {
        this.dom.turnInfo.textContent = 'Your Turn';
        this.dom.turnInfo.style.color = '#61dafb';
        this.dom.gameBoardDiv.classList.remove('disabled');
      } else {
        this.dom.turnInfo.textContent = `Opponent's Turn (${turn})`;
        this.dom.turnInfo.style.color = '#ccc';
        this.dom.gameBoardDiv.classList.add('disabled');
      }
    }
  }

  startCountdown(seconds) {
    let remaining = seconds;
    this.dom.timerDisplay.textContent = `Opponent disconnected. Waiting ${remaining}s...`;
    this.dom.timerDisplay.classList.remove('hidden');

    if (this.countdownInterval) clearInterval(this.countdownInterval);

    this.countdownInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        this.stopCountdown();
      } else {
        this.dom.timerDisplay.textContent = `Opponent disconnected. Waiting ${remaining}s...`;
      }
    }, 1000);
  }

  stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.dom.timerDisplay.classList.add('hidden');
    this.dom.timerDisplay.textContent = '';
  }
}
