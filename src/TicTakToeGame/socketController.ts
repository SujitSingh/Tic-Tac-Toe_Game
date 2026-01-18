import { Server, Socket } from 'socket.io';
import { TicTakToeGame, Player } from './TicTakToeGame';

const DISCONNECT_TIMEOUT = 15; // timeout seconds

interface GameRoomData {
  game: TicTakToeGame;
  players: Record<string, Player>; // socketId -> 'X' or 'O'
  ready: Record<string, boolean>; // socketId -> true/false
  timeout?: NodeJS.Timeout;
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
    socket.on('cancel_search', (roomId: string) => this.handleCancelSearch(socket, roomId));
    socket.on('join_room', (roomId: string, callback) => this.handleJoinRoom(socket, roomId, callback));
    socket.on('make_move', (data) => this.handleMakeMove(socket, data));
    socket.on('resign_game', (data) => this.handleResignGame(socket, data));
    socket.on('leave_room', (roomId: string) => this.handleLeaveRoom(socket, roomId));
    socket.on('disconnect', () => this.handleDisconnect(socket));
    socket.on('reset_game', (roomId: string) => this.handleResetGame(socket, roomId));
  }

  private handleSearchMatch(socket: Socket, callback: any) {
    const waitingRoomId = Object.keys(this.gameRooms).find(
      (id) => Object.keys(this.gameRooms[id].players).length === 1 && !this.gameRooms[id].timeout
    );

    if (waitingRoomId) {
      // join the waiting room
      const room = this.gameRooms[waitingRoomId];
      const roomId = waitingRoomId;

      const existingPlayers = Object.values(room.players);
      const assignedPlayer: Player = existingPlayers.includes('X') ? 'O' : 'X';

      room.players[socket.id] = assignedPlayer;
      room.ready[socket.id] = true;
      this.socketToRoom[socket.id] = roomId;

      socket.join(roomId);
      if (typeof callback === 'function') callback({ player: assignedPlayer, roomId });

      const readyState = Object.entries(room.players).reduce(
        (acc, [id, player]) => {
          acc[player] = room.ready[id] || false;
          return acc;
        },
        {} as Record<string, boolean>
      );

      this.io.to(roomId).emit('game_state', {
        ...room.game,
        ready: readyState,
        playerCount: Object.keys(room.players).length,
      });

      console.log(`User ${socket.id} joined room ${roomId} as ${assignedPlayer}`);
    } else {
      // create a new room
      const roomId = socket.id;
      this.gameRooms[roomId] = {
        game: new TicTakToeGame(),
        players: {},
        ready: {},
      };
      const room = this.gameRooms[roomId];

      const assignedPlayer: Player = 'X';

      room.players[socket.id] = assignedPlayer;
      room.ready[socket.id] = true;
      this.socketToRoom[socket.id] = roomId;

      socket.join(roomId);

      if (typeof callback === 'function') callback({ player: assignedPlayer, roomId });

      const readyState = { [assignedPlayer]: true };

      this.io.to(roomId).emit('game_state', {
        ...room.game,
        ready: readyState,
        playerCount: 1,
      });
      console.log(`User ${socket.id} created and joined room ${roomId} as ${assignedPlayer}`);
    }
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

  private handleJoinRoom(socket: Socket, roomId: string, callback: any) {
    const room = this.gameRooms[roomId];

    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }

    if (room.timeout) {
      clearTimeout(room.timeout);
      delete room.timeout;
    }

    const playerCount = Object.keys(room.players).length;

    if (playerCount >= 2) {
      socket.emit('error', 'Room is full');
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

    // send initial state
    const readyState = Object.entries(room.players).reduce(
      (acc, [id, player]) => {
        acc[player] = room.ready[id] || false;
        return acc;
      },
      {} as Record<string, boolean>
    );

    this.io.to(roomId).emit('game_state', {
      board: room.game.board,
      turn: room.game.turn,
      winner: room.game.winner,
      winningLine: room.game.winningLine,
      endReason: room.game.endReason,
      ready: readyState,
      playerCount: Object.keys(room.players).length,
    });

    console.log(`User ${socket.id} joined room ${roomId} as ${assignedPlayer}`);
  }

  private handleMakeMove(socket: Socket, { roomId, index }: { roomId: string; index: number }) {
    const room = this.gameRooms[roomId];
    if (!room) return;

    if (Object.keys(room.players).length < 2) {
      socket.emit('error', 'Waiting for opponent');
      return;
    }

    const playersInRoom = Object.keys(room.players);
    const allReady = playersInRoom.length === 2 && playersInRoom.every((id) => room.ready[id]);

    if (!allReady) {
      return; // ignore moves if not all players are ready
    }

    const player = room.players[socket.id];
    if (player !== room.game.turn) {
      socket.emit('error', 'Not your turn');
      return;
    }

    const success = room.game.makeMove(index);
    if (success) {
      const readyState = Object.entries(room.players).reduce(
        (acc, [id, player]) => {
          acc[player] = room.ready[id] || false;
          return acc;
        },
        {} as Record<string, boolean>
      );

      this.io.to(roomId).emit('game_state', {
        board: room.game.board,
        turn: room.game.turn,
        winner: room.game.winner,
        winningLine: room.game.winningLine,
        endReason: room.game.endReason,
        ready: readyState,
        playerCount: Object.keys(room.players).length,
      });
    }
  }

  private handleResignGame(socket: Socket, { roomId }: { roomId: string }) {
    const room = this.gameRooms[roomId];
    if (room && !room.game.winner) {
      const player = room.players[socket.id];
      if (player) {
        room.game.winner = player === 'X' ? 'O' : 'X';
        room.game.endReason = 'Resignation';
        const readyState = Object.entries(room.players).reduce(
          (acc, [id, player]) => {
            acc[player] = room.ready[id] || false;
            return acc;
          },
          {} as Record<string, boolean>
        );

        this.io.to(roomId).emit('game_state', {
          board: room.game.board,
          turn: room.game.turn,
          winner: room.game.winner,
          winningLine: room.game.winningLine,
          endReason: room.game.endReason,
          ready: readyState,
          playerCount: Object.keys(room.players).length,
        });
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

        const readyState = Object.entries(room.players).reduce(
          (acc, [id, player]) => {
            acc[player] = room.ready[id] || false;
            return acc;
          },
          {} as Record<string, boolean>
        );

        this.io.to(roomId).emit('game_state', {
          ...room.game,
          ready: readyState,
          playerCount: Object.keys(room.players).length,
        });
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

  private handleResetGame(socket: Socket, roomId: string) {
    const room = this.gameRooms[roomId];
    if (room) {
      if (Object.keys(room.players).length < 2) return;
      room.game.reset();

      const readyState = Object.entries(room.players).reduce(
        (acc, [id, player]) => {
          acc[player] = room.ready[id] || false;
          return acc;
        },
        {} as Record<string, boolean>
      );

      this.io.to(roomId).emit('game_state', {
        ...room.game,
        ready: readyState,
        playerCount: Object.keys(room.players).length,
      });
    }
  }
}

export const ticTakToeSocketHandlers = (io: Server) => {
  const gameCtrl = new TicTacToeSocketController(io);

  io.on('connection', (socket) => gameCtrl.handleConnection(socket));
};
