export default class TicTacToeGameClient {
  constructor() {
    this.socket = io();

    // DOM Elements
    this.lobbyDiv = document.getElementById('lobby');
    this.gameDiv = document.getElementById('game-container');
    this.startMatchBtn = document.getElementById('start-match-search');
    this.cancelGameSearchBtn = document.getElementById('cancel-game-search');
    this.gameBoardDiv = document.getElementById('game-board');
    this.playerInfo = document.getElementById('player-info');
    this.turnInfo = document.getElementById('turn-info');
    this.roomDisplay = document.getElementById('room-display');
    this.resetBtn = document.getElementById('reset-btn');
    this.resignBtn = document.getElementById('resign-btn');
    this.gameToLobbyBtn = document.getElementById('game-to-lobby-btn');
    this.timerDisplay = document.getElementById('timer-display');
    this.resultsDiv = document.getElementById('results');
    this.resultMessage = document.getElementById('result-message');
    this.backToLobbyBtn = document.getElementById('back-to-lobby-btn');

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
      this.socket.emit('join_room', roomId, (data) => this.handleRoomAssignment(data));
    }
  }

  initGameEventListeners() {
    this.startMatchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.startMatchBtn.classList.add('hidden');
      this.cancelGameSearchBtn.classList.remove('hidden');
      this.socket.emit('search_match', (data) => this.handleRoomAssignment(data));
    });

    this.cancelGameSearchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.currentRoomId) {
        this.socket.emit('cancel_search', this.currentRoomId);
      }
      this.currentRoomId = null;
      this.cancelGameSearchBtn.classList.add('hidden');
      this.startMatchBtn.classList.remove('hidden');
    });

    this.gameBoardDiv.addEventListener('click', (e) => {
      if (!this.isMyTurn) return;

      const cell = e.target;
      if (cell.classList.contains('cell') && !cell.textContent) {
        const index = parseInt(cell.getAttribute('data-index'));

        this.socket.emit('make_move', { roomId: this.currentRoomId, index });
      }
    });

    this.resetBtn.addEventListener('click', () => {
      this.socket.emit('reset_game', this.currentRoomId);
    });

    this.resignBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to resign?')) {
        this.socket.emit('resign_game', { roomId: this.currentRoomId });
      }
    });

    this.gameToLobbyBtn.addEventListener('click', () => {
      if (this.currentRoomId) {
        this.socket.emit('leave_room', this.currentRoomId);
      }
      this.gameDiv.classList.add('hidden');
      this.resultsDiv.classList.add('hidden');
      this.lobbyDiv.classList.remove('hidden');
      this.currentRoomId = null;
      this.myPlayer = null;

      window.history.pushState(null, '', '/');
    });

    this.backToLobbyBtn.addEventListener('click', () => {
      if (this.currentRoomId) {
        this.socket.emit('leave_room', this.currentRoomId);
      }
      this.resultsDiv.classList.add('hidden');
      this.lobbyDiv.classList.remove('hidden');
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
      this.gameBoardDiv.classList.add('disabled');
      this.resignBtn.classList.add('hidden');
      this.gameToLobbyBtn.classList.remove('hidden');

      this.turnInfo.textContent = message;
    });

    this.socket.on('error', (message) => {
      this.stopCountdown();
      alert(message);

      if (message === 'Room not found') {
        window.history.pushState(null, '', '/');
      }
    });
  }

  handleRoomAssignment({ player, roomId }) {
    this.myPlayer = player;
    this.currentRoomId = roomId;
    this.roomDisplay.textContent = `Room: ${roomId}`;
    this.playerInfo.textContent = `You are Player: ${player}`;
  }

  updateBoard(board, winningLine) {
    const cells = document.querySelectorAll('.cell');

    cells.forEach((cell, index) => {
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

    if (playerCount > 1 && !this.lobbyDiv.classList.contains('hidden')) {
      this.lobbyDiv.classList.add('hidden');
      this.gameDiv.classList.remove('hidden');
      this.startMatchBtn.classList.remove('hidden');
      this.cancelGameSearchBtn.classList.add('hidden');

      if (window.location.pathname === '/') {
        window.history.pushState(null, '', `/${encodeURIComponent(this.currentRoomId)}`);
      }
    }

    if (winner) {
      this.isMyTurn = false;
      this.gameBoardDiv.classList.add('disabled');
      this.resignBtn.classList.add('hidden');
      this.gameToLobbyBtn.classList.remove('hidden');

      if (playerCount < 2) {
        this.resetBtn.classList.add('hidden');
      } else {
        this.resetBtn.classList.remove('hidden');
      }

      if (winner === 'Draw') {
        this.turnInfo.textContent = "Game Over: It's a Draw!";
        this.turnInfo.style.color = 'orange';
      } else {
        const isWinner = winner === this.myPlayer;
        let reasonText = '';
        if (endReason === 'Resignation') {
          reasonText = isWinner ? '(Opponent Resigned)' : '(You Resigned)';
        }

        this.turnInfo.textContent = isWinner ? `You Won! ${reasonText}` : `You Lost! ${reasonText}`;
        this.turnInfo.style.color = isWinner ? '#61dafb' : '#ff6b6b';
      }
    } else {
      this.resetBtn.classList.add('hidden');
      this.resignBtn.classList.remove('hidden');
      this.gameToLobbyBtn.classList.add('hidden');
      this.isMyTurn = turn === this.myPlayer;

      if (this.isMyTurn) {
        this.turnInfo.textContent = 'Your Turn';
        this.turnInfo.style.color = '#61dafb';
        this.gameBoardDiv.classList.remove('disabled');
      } else {
        this.turnInfo.textContent = `Opponent's Turn (${turn})`;
        this.turnInfo.style.color = '#ccc';
        this.gameBoardDiv.classList.add('disabled');
      }
    }
  }

  startCountdown(seconds) {
    let remaining = seconds;
    this.timerDisplay.textContent = `Opponent disconnected. Waiting ${remaining}s...`;
    this.timerDisplay.classList.remove('hidden');

    if (this.countdownInterval) clearInterval(this.countdownInterval);

    this.countdownInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        this.stopCountdown();
      } else {
        this.timerDisplay.textContent = `Opponent disconnected. Waiting ${remaining}s...`;
      }
    }, 1000);
  }

  stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.timerDisplay.classList.add('hidden');
    this.timerDisplay.textContent = '';
  }
}
