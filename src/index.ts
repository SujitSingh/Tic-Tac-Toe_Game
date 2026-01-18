import dotenvx from '@dotenvx/dotenvx';
dotenvx.config();

import path from 'path';
import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { ticTakToeSocketHandlers } from './TicTakToeGame/socketController';

const PORT = process.env.SERVER_PORT;
const HOST = process.env.SERVER_HOST;
const isDevelopment = process.env.NODE_ENV === '' || process.env.NODE_ENV === 'development';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: isDevelopment ? `http://${HOST}:${PORT}` : null, // allow CORS for development
  },
});

ticTakToeSocketHandlers(io); // initiate game socket handlers

app.use(express.static(path.join(__dirname, '../public')));

app.get('/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use((req, res) => {
  res.redirect('/');
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${HOST}:${PORT}`);
});
