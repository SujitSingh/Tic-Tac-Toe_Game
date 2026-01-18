export type Player = 'X' | 'O';
export type Winner = Player | 'Draw' | null;

const winLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6], // diagonals
]; // prettier-ignore

export class TicTakToeGame {
  board: (Player | null)[];
  turn: Player;
  winner: Winner;
  winningLine: number[] | null;
  endReason: string | null;

  constructor() {
    this.board = Array(9).fill(null);
    this.turn = 'X';
    this.winner = null;
    this.winningLine = null;
    this.endReason = null;
  }

  makeMove(index: number): boolean {
    // validate move: index in bounds, cell empty, game not over
    if (index < 0 || index > 8 || this.board[index] !== null || this.winner !== null) {
      return false;
    }

    this.board[index] = this.turn;
    this.checkWinner();

    if (!this.winner) {
      this.turn = this.turn === 'X' ? 'O' : 'X';
    }

    return true;
  }

  checkWinner() {
    for (const [a, b, c] of winLines) {
      if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
        this.winner = this.board[a] as Player;
        this.winningLine = [a, b, c];
        this.endReason = 'Normal';
        return;
      }
    }

    if (!this.board.includes(null)) {
      this.winner = 'Draw';
      this.endReason = 'Draw';
    }
  }

  reset() {
    this.board = Array(9).fill(null);
    this.turn = 'X';
    this.winner = null;
    this.winningLine = null;
    this.endReason = null;
  }
}

export function getPredefinedMove(board: (Player | null)[], player: Player): number {
  const opponent = player === 'X' ? 'O' : 'X';

  // win condition checks
  for (const [a, b, c] of winLines) {
    if (board[a] === player && board[b] === player && board[c] === null) return c;
    if (board[a] === player && board[c] === player && board[b] === null) return b;
    if (board[b] === player && board[c] === player && board[a] === null) return a;
  }

  // block opponent checks
  for (const [a, b, c] of winLines) {
    if (board[a] === opponent && board[b] === opponent && board[c] === null) return c;
    if (board[a] === opponent && board[c] === opponent && board[b] === null) return b;
    if (board[b] === opponent && board[c] === opponent && board[a] === null) return a;
  }

  // pick center
  if (board[4] === null) return 4;

  // pick corners randomly
  const corners = [0, 2, 6, 8].filter((i) => board[i] === null);
  if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];

  return -1;
}
