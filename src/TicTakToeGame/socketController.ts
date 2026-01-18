import { Server, Socket } from 'socket.io';
import { TicTakToeGame, Player } from './TicTakToeGame';

const DISCONNECT_TIMEOUT = 15; // timeout seconds

interface GameRoomData {
  game: TicTakToeGame;
  players: Record<string, Player>; // socketId -> 'X' or 'O'
  ready: Record<string, boolean>; // socketId -> true/false
  timeout?: NodeJS.Timeout;
  isCpuGame?: boolean;
}

class TicTacToeSocketController {
  private io: Server;
  private gameRooms: Record<string, GameRoomData> = {};
  private socketToRoom: Record<string, string> = {};

  constructor(io: Server) {
    this.io = io;
  }

  public handleConnection(socket: Socket) {
    console.log('A user connected:', socket.id);

    socket.on('search_match', (callback) => this.handleSearchMatch(socket, callback));
    socket.on('start_cpu_game', (callback) => this.handleStartCpuGame(socket, callback));
    socket.on('cancel_search', (roomId: string) => this.handleCancelSearch(socket, roomId));
    socket.on('join_room', (roomId: string, callback) => this.handleJoinRoom(socket, roomId, callback));
    socket.on('player_move', (data) => this.handlePlayerMove(socket, data));
    socket.on('resign_game', (data) => this.handleResignGame(socket, data));
    socket.on('leave_room', (roomId: string) => this.handleLeaveRoom(socket, roomId));
    socket.on('disconnect', () => this.handleDisconnect(socket));
    socket.on('reset_game', (roomId: string) => this.handleResetGame(socket, roomId));
  }

  private handleSearchMatch(socket: Socket, callback: (data: { player: Player; roomId: string }) => void) {
    const waitingRoomId = Object.keys(this.gameRooms).find((id) => {
      const room = this.gameRooms[id];

      return !room.isCpuGame && !room.game.endReason && !room.timeout && Object.keys(room.players).length === 1;
    });

    let roomId: string;
    let assignedPlayer: Player;

    if (waitingRoomId) {
      // join the waiting room
      roomId = waitingRoomId;
      const room = this.gameRooms[roomId];

      const existingPlayers = Object.values(room.players);
      assignedPlayer = existingPlayers.includes('X') ? 'O' : 'X';
      console.log(`User ${socket.id} joined room ${roomId} as ${assignedPlayer}`);
    } else {
      // create a new room
      roomId = socket.id;

      this.gameRooms[roomId] = {
        game: new TicTakToeGame(),
        players: {},
        ready: {},
      };

      assignedPlayer = 'X';
      console.log(`User ${socket.id} created and joined room ${roomId} as ${assignedPlayer}`);
    }

    const room = this.gameRooms[roomId];

    room.players[socket.id] = assignedPlayer;
    room.ready[socket.id] = true;

    this.socketToRoom[socket.id] = roomId;
    socket.join(roomId);

    if (typeof callback === 'function') callback({ player: assignedPlayer, roomId });

    this.emitGameState(roomId);
  }

  private handleStartCpuGame(socket: Socket, callback: (data: { player: Player; roomId: string }) => void) {
    const roomId = socket.id;

    this.gameRooms[roomId] = {
      game: new TicTakToeGame(),
      players: { [socket.id]: 'X' },
      ready: { [socket.id]: true },
      isCpuGame: true,
    };

    this.socketToRoom[socket.id] = roomId;
    socket.join(roomId);

    if (typeof callback === 'function') callback({ player: 'X', roomId });

    this.emitGameState(roomId);
  }

  private handleCancelSearch(socket: Socket, roomId: string) {
    const room = this.gameRooms[roomId];
    delete this.socketToRoom[socket.id]; // remove the user from current room

    if (room) {
      if (room.timeout) {
        clearTimeout(room.timeout);
      }

      delete room.players[socket.id];
      delete room.ready[socket.id];

      this.io.in(roomId).socketsLeave(roomId); // disconnect the user from room connection

      if (Object.keys(room.players).length === 0) {
        // the waiting-room is now empty, just clean it up.
        delete this.gameRooms[roomId];
        console.log(`Room ${roomId} cleared (last user left)`);
      }
    }
  }

  private handleJoinRoom(socket: Socket, roomId: string, callback: (data: { player: Player; roomId: string }) => void) {
    const room = this.gameRooms[roomId];

    if (!room) {
      socket.emit('error', { message: 'Room not found', toHome: true });
      return;
    }

    if (room.isCpuGame && Object.keys(room.players).length >= 1) {
      socket.emit('error', { message: 'Cannot join a CPU game' });
      return;
    }

    if (room.timeout) {
      clearTimeout(room.timeout);
      delete room.timeout;
    }

    const playerCount = Object.keys(room.players).length;

    if (playerCount >= 2) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    // assign 'X' to first player, 'O' to second
    const existingPlayers = Object.values(room.players);
    const assignedPlayer: Player = existingPlayers.includes('X') ? 'O' : 'X';

    room.players[socket.id] = assignedPlayer;
    room.ready[socket.id] = true;
    this.socketToRoom[socket.id] = roomId;

    socket.join(roomId);
    if (typeof callback === 'function') callback({ player: assignedPlayer, roomId });

    this.emitGameState(roomId);

    console.log(`User ${socket.id} joined room ${roomId} as ${assignedPlayer}`);
  }

  private handlePlayerMove(socket: Socket, { roomId, index }: { roomId: string; index: number }) {
    const room = this.gameRooms[roomId];
    if (!room) {
      socket.emit('error', { message: 'This match is no longer valid. Reload your game.', reload: true });
      return;
    }

    if (!room.isCpuGame && Object.keys(room.players).length < 2) {
      socket.emit('error', { message: 'Waiting for opponent' });
      return;
    }

    const playersInRoom = Object.keys(room.players);

    const allReady = room.isCpuGame
      ? playersInRoom.every((id) => room.ready[id])
      : playersInRoom.length === 2 && playersInRoom.every((id) => room.ready[id]);

    if (!allReady) return; // ignore moves if not all players are ready

    const player = room.players[socket.id];
    if (player !== room.game.turn) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    const success = room.game.makeMove(index);
    if (success) {
      this.emitGameState(roomId);

      if (room.isCpuGame && !room.game.endReason) {
        this.makeCpuMove(roomId);
      }
    }
  }

  private handleResignGame(socket: Socket, { roomId }: { roomId: string }) {
    const room = this.gameRooms[roomId];
    if (!room) {
      socket.emit('error', { message: 'This match is no longer valid.', toHome: true });
      return;
    }

    if (room && !room.game.winner) {
      const player = room.players[socket.id];
      if (player) {
        room.game.winner = player === 'X' ? 'O' : 'X';
        room.game.endReason = 'Resignation';

        this.emitGameState(roomId);
      }
    }
  }

  private handleLeaveRoom(socket: Socket, roomId: string) {
    const room = this.gameRooms[roomId];
    delete this.socketToRoom[socket.id];

    if (room) {
      if (room.timeout) {
        clearTimeout(room.timeout);
        delete room.timeout;
      }

      delete room.players[socket.id];
      delete room.ready[socket.id];

      socket.leave(roomId);

      if (Object.keys(room.players).length === 0) {
        delete this.gameRooms[roomId];
        console.log(`Room ${roomId} cleared (last user left)`);
      } else {
        if (!room.game.winner) {
          // if the game is still active (no winner), notify the opponent
          this.io.to(roomId).emit('game_end_timeout', 'Opponent left the room. You Win!');
        }

        this.emitGameState(roomId);
      }
    }
  }

  private handleDisconnect(socket: Socket) {
    console.log('User disconnected:', socket.id);

    const roomId = this.socketToRoom[socket.id];
    if (!roomId) return;

    delete this.socketToRoom[socket.id];
    const room = this.gameRooms[roomId];

    if (room && room.players[socket.id]) {
      if (room.timeout) {
        clearTimeout(room.timeout);
        delete room.timeout;
      }

      delete room.players[socket.id];
      delete room.ready[socket.id];

      if (Object.keys(room.players).length === 0) {
        console.log(`Room ${roomId} is empty. Waiting ${DISCONNECT_TIMEOUT}s before clearing...`);
        room.timeout = setTimeout(() => {
          delete this.gameRooms[roomId];
          console.log(`Room ${roomId} cleared`);
        }, DISCONNECT_TIMEOUT * 1000);
      } else {
        if (room.game.winner) return; // game has already ended

        this.io.to(roomId).emit('opponent_left', { timeout: DISCONNECT_TIMEOUT });

        room.timeout = setTimeout(() => {
          if (this.gameRooms[roomId]) {
            this.io.to(roomId).emit('game_end_timeout', 'Opponent disconnected. You Win!');
            this.io.in(roomId).socketsLeave(roomId);

            delete this.gameRooms[roomId];
            console.log(`Room ${roomId} cleared due to player disconnect timeout`);
          }
        }, DISCONNECT_TIMEOUT * 1000);
      }
    }
  }

  private makeCpuMove(roomId: string) {
    const room = this.gameRooms[roomId];
    if (!room || !room.isCpuGame) return;

    setTimeout(() => {
      if (room.game.endReason) return;

      // select indexes of free cells
      const emptyIndices: number[] = room.game.board.reduce((acc, val, idx) => {
        if (val === null) acc.push(idx);
        return acc;
      }, []);

      if (emptyIndices.length > 0) {
        const randomIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];

        room.game.makeMove(randomIndex);
        this.emitGameState(roomId);
      }
    }, 500);
  }

  private handleResetGame(socket: Socket, roomId: string) {
    const room = this.gameRooms[roomId];
    if (room) {
      if (!room.isCpuGame && Object.keys(room.players).length < 2) return;
      room.game.reset();

      this.emitGameState(roomId);
    }
  }

  private getPlayersReadyState(room: GameRoomData): Record<string, boolean> {
    return Object.entries(room.players).reduce(
      (acc, [id, player]) => {
        acc[player] = room.ready[id] || false;
        return acc;
      },
      {} as Record<string, boolean>
    );
  }

  private emitGameState(roomId: string) {
    const room = this.gameRooms[roomId];
    if (!room) return;

    const readyState = this.getPlayersReadyState(room);

    this.io.to(roomId).emit('game_state', {
      ...room.game,
      ready: readyState,
      playerCount: room.isCpuGame ? 2 : Object.keys(room.players).length,
    });
  }
}

export const ticTakToeSocketHandlers = (io: Server) => {
  const gameCtrl = new TicTacToeSocketController(io);

  io.on('connection', (socket) => gameCtrl.handleConnection(socket));
};
