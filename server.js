const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Test route for directly accessing waiting room
app.get('/test-waiting', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-waiting.html'));
});

// Test route for redirect debugging
app.get('/test-redirect', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-redirect.html'));
});

// Route to serve game.html for both /game and /game/:roomId paths
app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'game.html'));
});

app.get('/game/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'game.html'));
});

// Route to serve waiting room
app.get('/waiting/:roomId', (req, res) => {
  console.log(`Serving waiting.html for room: ${req.params.roomId}`);
  res.sendFile(path.join(__dirname, 'waiting.html'));
});

// Fallback route to catch any waiting/ paths that were missed
app.get('/waiting*', (req, res) => {
  console.log(`Fallback: Serving waiting.html for path: ${req.path}`);
  res.sendFile(path.join(__dirname, 'waiting.html'));
});

// Game rooms data structure
const rooms = {};

// Queue for random matchmaking
const randomMatchQueue = [];

// Room status enum
const RoomStatus = {
  WAITING: 'waiting',
  PLAYING: 'playing'
};

// Debug route to see active rooms
app.get('/rooms', (req, res) => {
  const roomList = Object.keys(rooms).map(id => ({
    id,
    playerCount: rooms[id].players.length,
    spectatorCount: rooms[id].spectators ? rooms[id].spectators.length : 0,
    active: rooms[id].gameActive,
    status: rooms[id].status
  }));
  res.json(roomList);
});

// Socket.io logic
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Send existing rooms to client on connection
  socket.emit('availableRooms', Object.keys(rooms));

  // Notify server that a random match game has started
  socket.on('randomMatchGameStarted', ({ roomId }) => {
    console.log(`Random match game started: ${roomId}`);
    
    const room = rooms[roomId];
    if (room) {
      // Ensure the room is set to playing status
      room.status = RoomStatus.PLAYING;
      room.gameActive = true;
      room.gameStartedAt = Date.now(); // Add timestamp for when game actually started
      
      // Notify both players in the room about game state
      io.to(roomId).emit('gameInitialized', {
        gameState: room.gameState,
        currentPlayer: 'X', // X always goes first
        players: room.players,
        gameActive: true
      });
      
      console.log(`Updated room ${roomId} to playing status for random match and notified players`);
    }
  });

  // Find a random match
  socket.on('findRandomMatch', (playerName) => {
    console.log(`Player ${playerName} is looking for a random match`);
    
    // Check if player is already in the queue
    const existingQueueEntry = randomMatchQueue.find(entry => entry.socketId === socket.id);
    if (existingQueueEntry) {
      console.log(`Player ${playerName} is already in the queue`);
      return;
    }
    
    // Add player to the queue
    const queueEntry = {
      socketId: socket.id,
      playerName: playerName,
      joinedAt: Date.now()
    };
    randomMatchQueue.push(queueEntry);
    
    console.log(`Added player ${playerName} to random match queue. Queue length: ${randomMatchQueue.length}`);
    
    // If there are at least 2 players in the queue, match them
    if (randomMatchQueue.length >= 2) {
      const player1 = randomMatchQueue.shift();
      const player2 = randomMatchQueue.shift();
      
      // Create a new room
      const roomId = uuidv4().substring(0, 8);
      
      rooms[roomId] = {
        id: roomId,
        players: [
          {
            id: player1.socketId,
            name: player1.playerName,
            symbol: 'X',
            connected: true,
            isHost: true  // First player is the host
          },
          {
            id: player2.socketId,
            name: player2.playerName,
            symbol: 'O',
            connected: true,
            isHost: false
          }
        ],
        spectators: [],
        participants: [
          {
            id: player1.socketId,
            name: player1.playerName,
            symbol: 'X',
            connected: true,
            isSpectator: false,
            isHost: true
          },
          {
            id: player2.socketId,
            name: player2.playerName,
            symbol: 'O',
            connected: true,
            isSpectator: false,
            isHost: false
          }
        ],
        gameState: ['', '', '', '', '', '', '', '', ''],
        currentPlayer: 'X',
        gameActive: true,  // Set game to active immediately for random matches
        status: RoomStatus.PLAYING,  // Set to PLAYING instead of WAITING for random matches
        scores: { X: 0, O: 0 },
        messages: [],
        waitingRoomMessages: [],
        createdAt: Date.now(),
        isRandomMatch: true,
        gameStartedAt: null  // Will be set when the game actually starts
      };
      
      // Join both players to the room
      const player1Socket = io.sockets.sockets.get(player1.socketId);
      const player2Socket = io.sockets.sockets.get(player2.socketId);
      
      if (player1Socket) {
        player1Socket.join(roomId);
        player1Socket.roomId = roomId;
        player1Socket.emit('randomMatchFound', { 
          roomId, 
          playerSymbol: 'X',
          isHost: true,  // First player is host
          waitingRoom: false,  // Skip waiting room for random matches
          opponentName: player2.playerName,  // Include opponent name
          players: [
            { name: player1.playerName, symbol: 'X' },
            { name: player2.playerName, symbol: 'O' }
          ]
        });
      }
      
      if (player2Socket) {
        player2Socket.join(roomId);
        player2Socket.roomId = roomId;
        player2Socket.emit('randomMatchFound', { 
          roomId, 
          playerSymbol: 'O',
          isHost: false,
          waitingRoom: false,  // Skip waiting room for random matches
          opponentName: player1.playerName,  // Include opponent name
          players: [
            { name: player1.playerName, symbol: 'X' },
            { name: player2.playerName, symbol: 'O' }
          ]
        });
      }
      
      console.log(`Matched players ${player1.playerName} and ${player2.playerName} in room ${roomId}`);
      
      // Broadcast updated room list to all clients
      io.emit('availableRooms', Object.keys(rooms));
    }
  });
  
  // Cancel random match search
  socket.on('cancelRandomMatch', () => {
    // First check if the player is in the queue
    const index = randomMatchQueue.findIndex(entry => entry.socketId === socket.id);
    if (index !== -1) {
      const player = randomMatchQueue[index];
      randomMatchQueue.splice(index, 1);
      console.log(`Player ${player.playerName} cancelled random match search`);
    }
    
    // Also check if the player is already in a room but wants to cancel before game starts
    if (socket.roomId) {
      const roomId = socket.roomId;
      const room = rooms[roomId];
      
      if (room && room.isRandomMatch && !room.gameStartedAt) {
        console.log(`Player ${socket.id} cancelling random match in room ${roomId}`);
        
        // Find the player who wants to cancel
        const player = room.players.find(p => p.id === socket.id);
        const playerName = player ? player.name : 'A player';
        
        // Create the cancellation message
        const cancelMessage = {
          message: `${playerName} cancelled the match`,
          cancelledBy: playerName,
          roomId: roomId,
          reason: 'cancelled'
        };
        
        // Notify all players in the room, including the one who cancelled
        io.to(roomId).emit('randomMatchCancelled', cancelMessage);
        
        console.log(`Emitted randomMatchCancelled to room ${roomId} - cancelled by ${playerName}`);
        
        // Delete the room
        delete rooms[roomId];
        io.emit('availableRooms', Object.keys(rooms));
        
        console.log(`Room ${roomId} deleted after random match cancellation by ${playerName}`);
      }
    }
  });

  // Create a new game room
  socket.on('createRoom', (playerName) => {
    const roomId = uuidv4().substring(0, 8);
    
    console.log(`Creating room ${roomId} for player ${playerName}`);
    
    rooms[roomId] = {
      id: roomId,
      players: [{
        id: socket.id,
        name: playerName,
        symbol: 'X',
        connected: true,
        isHost: true  // Room creator is the host
      }],
      spectators: [],
      participants: [{
        id: socket.id,
        name: playerName,
        symbol: 'X',
        connected: true,
        isSpectator: false,
        isHost: true  // Room creator is the host
      }],
      gameState: ['', '', '', '', '', '', '', '', ''],
      currentPlayer: 'X',
      gameActive: false,  // Game not active until host starts it
      status: RoomStatus.WAITING,  // Start in waiting room
      scores: { X: 0, O: 0 },
      messages: [],
      waitingRoomMessages: [],
      createdAt: Date.now(),
      creatorId: socket.id,  // Store the creator's socket ID
      creatorName: playerName  // Store the creator's name
    };
    
    socket.join(roomId);
    socket.roomId = roomId; // Store room ID on socket for reconnection
    
    // Also store host status directly on the socket
    socket.isHost = true;
    socket.gameSymbol = 'X';
    
    // Broadcast updated room list to all clients
    io.emit('availableRooms', Object.keys(rooms));
    
    const roomCreatedData = { 
      roomId, 
      playerSymbol: 'X',
      isHost: true,
      waitingRoom: true  // Send to waiting room
    };
    
    console.log(`Emitting roomCreated event:`, roomCreatedData);
    socket.emit('roomCreated', roomCreatedData);
    
    console.log(`Room created: ${roomId} by player: ${playerName}, status: ${rooms[roomId].status}`);
  });

  // Join waiting room
  socket.on('joinWaitingRoom', ({ roomId, playerName, playerSymbol, isHost }) => {
    console.log(`Player ${playerName} joining waiting room: ${roomId}`);
    console.log(`Join data:`, { roomId, playerName, playerSymbol, isHost });
    
    const room = rooms[roomId];
    
    if (!room) {
      socket.emit('error', { message: 'Room not found!' });
      return;
    }
    
    // Special case: check if this player is the room creator
    const isCreator = room.creatorName === playerName || room.creatorId === socket.id;
    if (isCreator && !isHost) {
      isHost = true;
      console.log(`Detected room creator ${playerName}, enforcing host status`);
    }
    
    // Check if player is already in the room
    let participant = room.participants.find(p => p.name === playerName);
    let isNewParticipant = false;
    
    if (!participant) {
      isNewParticipant = true;
      
      // Determine if joining as spectator or player
      const isSpectator = room.players.length >= 2;
      
      if (isSpectator) {
        // Join as spectator
        participant = {
          id: socket.id,
          name: playerName,
          connected: true,
          isSpectator: true,
          isHost: false,
          symbol: 'spectator'
        };
        
        if (!room.spectators) room.spectators = [];
        room.spectators.push(participant);
      } else {
        // Check if this should be the host (first player or explicit host flag)
        const shouldBeHost = (room.players.length === 0) || (isHost === true && isCreator);
        
        // Join as player
        participant = {
          id: socket.id,
          name: playerName,
          symbol: room.players.length === 0 ? 'X' : 'O',
          connected: true,
          isSpectator: false,
          isHost: shouldBeHost
        };
        
        // For the room creator, ensure they get symbol X
        if (isCreator && participant.symbol !== 'X') {
          // Swap symbols with the other player
          if (room.players.length > 0) {
            room.players[0].symbol = 'O';
            // Update in participants array too
            const otherParticipant = room.participants.find(p => p.name === room.players[0].name);
            if (otherParticipant) {
              otherParticipant.symbol = 'O';
            }
          }
          participant.symbol = 'X';
        }
        
        room.players.push(participant);
      }
      
      // Add to participants list
      room.participants.push(participant);
    } else {
      // Update existing participant
      participant.id = socket.id;
      participant.connected = true;
      
      // If player had host status previously or is the creator, preserve it
      if ((isHost === true && isCreator) || (participant.isHost && isCreator)) {
        participant.isHost = true;
        
        // Also update in players array
        const playerIndex = room.players.findIndex(p => p.name === playerName);
        if (playerIndex !== -1) {
          room.players[playerIndex].isHost = true;
        }
      }
    }
    
    // Store host status on socket for easier checking
    socket.isHost = participant.isHost;
    socket.gameSymbol = participant.symbol;
    socket.playerName = playerName;
    
    socket.join(roomId);
    socket.roomId = roomId;
    
    console.log(`Sending waitingRoomJoined with isHost:`, participant.isHost);
    
    // Send waiting room info to the player
    socket.emit('waitingRoomJoined', {
      roomId,
      playerSymbol: participant.symbol,
      isHost: participant.isHost,
      isSpectator: participant.isSpectator,
      participants: room.participants,
    });
    
    // If new participant, notify others
    if (isNewParticipant) {
      socket.to(roomId).emit('participantJoined', {
        participant,
        participants: room.participants
      });
    }
    
    // Send previous waiting room messages
    if (room.waitingRoomMessages && room.waitingRoomMessages.length > 0) {
      room.waitingRoomMessages.forEach(msg => {
        socket.emit('waitingRoomMessage', msg);
      });
    }
    
    console.log(`Player ${playerName} joined waiting room: ${roomId}, isHost: ${participant.isHost}`);
  });

  // Leave waiting room
  socket.on('leaveWaitingRoom', ({ roomId, playerName }) => {
    console.log(`Player ${playerName} leaving waiting room: ${roomId}`);
    
    const room = rooms[roomId];
    if (!room) return;
    
    // Find participant
    const participantIndex = room.participants.findIndex(p => p.name === playerName);
    
    if (participantIndex !== -1) {
      const participant = room.participants[participantIndex];
      
      // If host is leaving, assign a new host from remaining players
      if (participant.isHost && !participant.isSpectator) {
        const remainingPlayers = room.players.filter(p => p.name !== playerName && p.connected);
        if (remainingPlayers.length > 0) {
          remainingPlayers[0].isHost = true;
          
          // Update in participants list
          const newHostIndex = room.participants.findIndex(p => p.name === remainingPlayers[0].name);
          if (newHostIndex !== -1) {
            room.participants[newHostIndex].isHost = true;
          }
        }
      }
      
      // Remove from players list if not spectator
      if (!participant.isSpectator) {
        const playerIndex = room.players.findIndex(p => p.name === playerName);
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
        }
      } else {
        // Remove from spectators list
        const spectatorIndex = room.spectators.findIndex(s => s.name === playerName);
        if (spectatorIndex !== -1) {
          room.spectators.splice(spectatorIndex, 1);
        }
      }
      
      // Remove from participants list
      room.participants.splice(participantIndex, 1);
      
      // Leave socket room
      socket.leave(roomId);
      
      // Notify others
      socket.to(roomId).emit('participantLeft', {
        participantName: playerName,
        participants: room.participants
      });
      
      // If room is empty, delete it
      if (room.participants.length === 0) {
        delete rooms[roomId];
        io.emit('availableRooms', Object.keys(rooms));
      }
      
      console.log(`Player ${playerName} left waiting room: ${roomId}`);
    }
  });
  
  // Waiting room chat message
  socket.on('waitingRoomMessage', ({ roomId, sender, message, symbol }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    // Create message object
    const messageObj = {
      sender,
      message,
      symbol,
      timestamp: Date.now()
    };
    
    // Store message in room history
    if (!room.waitingRoomMessages) room.waitingRoomMessages = [];
    room.waitingRoomMessages.push(messageObj);
    if (room.waitingRoomMessages.length > 50) {
      room.waitingRoomMessages.shift(); // Remove oldest message
    }
    
    // Broadcast to all clients in the room
    io.to(roomId).emit('waitingRoomMessage', messageObj);
  });
  
  // Start game
  socket.on('startGame', ({ roomId, playerName }) => {
    console.log(`Start game request for room: ${roomId} from player: ${playerName}`);
    
    const room = rooms[roomId];
    if (!room) {
        console.log(`Room not found: ${roomId}`);
        socket.emit('error', { message: 'Room not found' });
        return;
    }
    
    // Check if there are at least 2 players
    if (room.players.length < 2) {
        console.log(`Not enough players in room: ${roomId}, players: ${room.players.length}`);
        socket.emit('error', { message: 'Need at least 2 players to start the game' });
        return;
    }
    
    // Find the player in the room
    const player = room.players.find(p => p.name === playerName);
    if (!player) {
        console.log(`Player ${playerName} not found in room ${roomId}`);
        socket.emit('error', { message: 'Player not found in room' });
        return;
    }
    
    // Verify host status
    if (!player.isHost) {
        // Double check if they're the creator
        if (room.creatorId === socket.id || room.creatorName === playerName) {
            console.log(`Player ${playerName} is the creator, granting host status`);
            player.isHost = true;
            
            // Update in participants list
            const participant = room.participants.find(p => p.name === playerName);
            if (participant) {
                participant.isHost = true;
            }
        } else {
            console.log(`Player ${playerName} is not host and not creator`);
            socket.emit('error', { message: 'Only the host can start the game' });
            return;
        }
    }
    
    // Update room status
    room.status = RoomStatus.PLAYING;
    room.gameActive = true;
    room.currentPlayer = 'X'; // Ensure X starts first
    
    console.log(`Game starting in room: ${roomId} by host: ${playerName}`);
    
    // Notify all participants that game is starting
    io.to(roomId).emit('gameStarting');
  });

  // Helper function to update participants list
  function updateParticipants(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    
    room.participants = [
      ...room.players.filter(p => p).map(p => ({
        id: p.id,
        name: p.name,
        symbol: p.symbol,
        connected: p.connected,
        isSpectator: false,
        isHost: p.isHost || false
      })),
      ...room.spectators.filter(s => s).map(s => ({
        id: s.id,
        name: s.name,
        symbol: 'spectator',
        connected: s.connected,
        isSpectator: true,
        isHost: false
      }))
    ];
    
    // Emit updated participants to all clients in the room
    io.to(roomId).emit('participantsUpdate', { participants: room.participants });
  }

  // Join an existing room
  socket.on('joinRoom', ({ roomId, playerName, asSpectator = false }) => {
    console.log(`Attempting to join room: ${roomId}`);
    
    const room = rooms[roomId];
    
    if (!room) {
      console.log(`Room not found: ${roomId}`);
      socket.emit('error', { message: 'Room does not exist!' });
      return;
    }
    
    console.log(`Room found: ${roomId} with ${room.players.length} players, status: ${room.status}`);
    
    // Initialize spectators array if it doesn't exist
    if (!room.spectators) {
      room.spectators = [];
    }
    
    // Check if joining as spectator or if both player slots are taken
    if (asSpectator || (room.players.length >= 2 && !room.players.find(p => p.name === playerName))) {
      // Join as spectator
      const spectator = {
        id: socket.id,
        name: playerName,
        connected: true,
        isHost: false
      };
      
      room.spectators.push(spectator);
      
      // Add to participants list
      room.participants.push({
        id: socket.id,
        name: playerName,
        symbol: 'spectator',
        connected: true,
        isSpectator: true,
        isHost: false
      });
      
      socket.join(roomId);
      socket.roomId = roomId;
      
      // Notify the room that a spectator joined
      socket.to(roomId).emit('spectatorJoined', { spectator });
      
      // Send room data to the spectator
      socket.emit('roomJoined', {
        roomId,
        isSpectator: true,
        waitingRoom: room.status === RoomStatus.WAITING  // Send to waiting room if still in waiting state
      });
      
      console.log(`${playerName} joined room ${roomId} as a spectator`);
      return;
    }
    
    // Check if player is already in room and just needs to reconnect
    const existingPlayer = room.players.find(p => p.name === playerName);
    if (existingPlayer && existingPlayer.connected === false) {
      console.log(`Player ${playerName} is reconnecting to room ${roomId}`);
      existingPlayer.id = socket.id;
      existingPlayer.connected = true;
      
      socket.join(roomId);
      socket.roomId = roomId;
      
      // Cancel any pending deletion timeout for this room
      if (room.deletionTimeout) {
        clearTimeout(room.deletionTimeout);
        delete room.deletionTimeout;
        console.log(`Deletion timeout cancelled for room ${roomId} during join`);
      }
      
      // Update participants list
      updateParticipants(roomId);
      
      // Notify the rejoining player
      socket.emit('roomJoined', { 
        roomId, 
        playerSymbol: existingPlayer.symbol,
        isSpectator: false,
        isHost: existingPlayer.isHost,
        waitingRoom: room.status === RoomStatus.WAITING  // Send to waiting room if still in waiting state
      });
      
      // Notify other players about reconnection
      socket.to(roomId).emit('playerJoined', {
        player: existingPlayer
      });
      
      console.log(`Player ${playerName} reconnected to room: ${roomId}`);
      return;
    }
    
    if (room.players.length >= 2) {
      socket.emit('error', { message: 'Room is full! Joining as spectator.' });
      
      // Join as spectator instead
      const spectator = {
        id: socket.id,
        name: playerName,
        connected: true,
        isHost: false
      };
      
      room.spectators.push(spectator);
      
      // Add to participants list
      room.participants.push({
        id: socket.id,
        name: playerName,
        symbol: 'spectator',
        connected: true,
        isSpectator: true,
        isHost: false
      });
      
      socket.join(roomId);
      socket.roomId = roomId;
      
      // Notify the room that a spectator joined
      socket.to(roomId).emit('spectatorJoined', { spectator });
      
      // Send room data to the spectator
      socket.emit('roomJoined', {
        roomId,
        isSpectator: true,
        waitingRoom: room.status === RoomStatus.WAITING  // Send to waiting room if still in waiting state
      });
      
      console.log(`${playerName} joined room ${roomId} as a spectator (room was full)`);
      return;
    }
    
    // Add new player to room
    const newPlayer = {
      id: socket.id,
      name: playerName,
      symbol: 'O',
      connected: true,
      isHost: false  // Not the host (joined an existing room)
    };
    
    room.players.push(newPlayer);
    
    // Add to participants list
    room.participants.push({
      id: socket.id,
      name: playerName,
      symbol: 'O',
      connected: true,
      isSpectator: false,
      isHost: false
    });
    
    socket.join(roomId);
    socket.roomId = roomId; // Store room ID on socket for reconnection
    
    // Notify the joining player
    socket.emit('roomJoined', { 
      roomId,
      playerSymbol: 'O',
      isSpectator: false,
      isHost: false,
      waitingRoom: room.status === RoomStatus.WAITING  // Send to waiting room if still in waiting state
    });
    
    // Notify the room creator that someone joined
    socket.to(roomId).emit('playerJoined', {
      player: newPlayer
    });
    
    console.log(`Player ${playerName} joined room: ${roomId} as new player`);
  });

  // Check if room exists
  socket.on('checkRoom', (roomId) => {
    const roomExists = !!rooms[roomId];
    const room = rooms[roomId];
    
    let playersInfo = null;
    let status = null;
    
    if (room) {
      playersInfo = room.players.map(p => ({
        name: p.name,
        symbol: p.symbol,
        connected: p.connected
      }));
      
      status = room.status || RoomStatus.PLAYING; // Default to playing for backward compatibility
      console.log(`Room ${roomId} status is ${status}`);
    }
    
    socket.emit('roomStatus', { 
      roomId, 
      exists: roomExists,
      players: playersInfo,
      status: status
    });
    
    console.log(`Room check: ${roomId}, exists: ${roomExists}, status: ${status}${playersInfo ? `, players: ${JSON.stringify(playersInfo)}` : ''}`);
  });

  // Reconnect to room
  socket.on('reconnectToRoom', ({ roomId, playerName, playerSymbol }) => {
    console.log(`Reconnect attempt to room: ${roomId}, player: ${playerName}, symbol: ${playerSymbol}`);
    
    const room = rooms[roomId];
    
    if (!room) {
      socket.emit('error', { message: 'Room does not exist anymore!' });
      return;
    }
    
    // Check if player slot is available
    const existingPlayer = room.players.find(p => p.symbol === playerSymbol);
    
    console.log(`Existing player found: ${JSON.stringify(existingPlayer)}`);
    console.log(`Current room players: ${JSON.stringify(room.players)}`);
    
    if (existingPlayer && existingPlayer.id !== socket.id && existingPlayer.connected === true) {
      socket.emit('error', { message: 'This player position is already taken!' });
      return;
    }
    
    // Replace disconnected player or add new player
    if (existingPlayer) {
      existingPlayer.id = socket.id;
      existingPlayer.name = playerName;
      existingPlayer.connected = true;
      console.log(`Player reconnected: ${playerName} as ${playerSymbol}`);
    } else if (room.players.length < 2) {
      const newSymbol = playerSymbol || (room.players[0].symbol === 'X' ? 'O' : 'X');
      room.players.push({
        id: socket.id,
        name: playerName,
        symbol: newSymbol,
        connected: true
      });
      console.log(`New player added: ${playerName} as ${newSymbol}`);
    } else {
      socket.emit('error', { message: 'Room is full!' });
      return;
    }
    
    socket.join(roomId);
    socket.roomId = roomId;
    
    // Cancel any pending deletion timeout for this room
    if (room.deletionTimeout) {
      clearTimeout(room.deletionTimeout);
      delete room.deletionTimeout;
      console.log(`Deletion timeout cancelled for room ${roomId}`);
    }
    
    // Update participants list
    updateParticipants(roomId);
    
    // Notify the joining player
    socket.emit('roomJoined', { 
      roomId, 
      playerSymbol: existingPlayer ? existingPlayer.symbol : (playerSymbol || (room.players[0].symbol === 'X' ? 'O' : 'X')),
      gameState: room.gameState,
      currentPlayer: room.currentPlayer,
      players: room.players,
      scores: room.scores,
      isSpectator: false,
      participants: room.participants
    });
    
    // Notify others in the room
    socket.to(roomId).emit('playerJoined', {
      player: {
        id: socket.id,
        name: playerName,
        symbol: existingPlayer ? existingPlayer.symbol : (playerSymbol || (room.players[0].symbol === 'X' ? 'O' : 'X'))
      }
    });
  });

  // Make a move
  socket.on('makeMove', ({ roomId, cellIndex }) => {
    const room = rooms[roomId];
    
    if (!room) return;
    
    // Find the player who made the move
    const player = room.players.find(p => p.id === socket.id);
    
    if (!player || player.symbol !== room.currentPlayer) return;
    if (room.gameState[cellIndex] !== '') return; // Cell already filled
    
    // Update game state
    room.gameState[cellIndex] = player.symbol;
    
    // Broadcast move to all clients in the room
    io.to(roomId).emit('moveMade', {
      cellIndex,
      symbol: player.symbol,
      gameState: room.gameState
    });
    
    // Check for winner or draw
    const result = checkWinner(room.gameState);
    
    if (result) {
      // Game is over
      room.gameActive = false;
      
      // Update scores
      if (result === 'draw') {
        io.to(roomId).emit('gameOver', { draw: true, scores: room.scores });
      } else {
        room.scores[result]++;
        
        // Determine the winning combination
        const winningCombination = getWinningCombination(room.gameState);
        
        io.to(roomId).emit('gameOver', { 
          winner: result, 
          winningCombination, 
          scores: room.scores 
        });
      }
    } else {
      // Switch player
      room.currentPlayer = room.currentPlayer === 'X' ? 'O' : 'X';
      
      // Broadcast turn change
      io.to(roomId).emit('playerTurnChanged', {
        currentPlayer: room.currentPlayer
      });
    }
  });

  // Restart game
  socket.on('restartGame', (roomId) => {
    console.log(`Restart game request for room: ${roomId}`);
    
    const room = rooms[roomId];
    if (!room) return;
    
    // Check if there are at least 2 connected players
    const connectedPlayers = room.players.filter(p => p.connected).length;
    
    if (connectedPlayers < 2) {
      console.log(`Cannot restart - not enough connected players in room ${roomId}`);
      socket.emit('error', { message: 'Cannot restart game - waiting for opponent' });
      return;
    }
    
    // Log player connection statuses for debugging
    room.players.forEach(p => {
      console.log(`Player ${p.name} connection status: ${p.connected}`);
    });
    
    // Reset game state
    room.gameState = ['', '', '', '', '', '', '', '', ''];
    room.gameActive = true;
    
    // Determine starting player (alternate)
    const lastPlayer = room.currentPlayer;
    room.currentPlayer = lastPlayer === 'X' ? 'O' : 'X';
    
    console.log(`Restarting game in room ${roomId}`);
    
    // Broadcast restart to all clients in the room
    io.to(roomId).emit('gameRestarted', {
      gameState: room.gameState,
      currentPlayer: room.currentPlayer
    });
    
    console.log(`Game restarted in room ${roomId}, current player: ${room.currentPlayer}`);
  });

  // Chat message handling
  socket.on('chatMessage', ({ roomId, sender, message, symbol }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    // Create message object
    const messageObj = {
      sender,
      message,
      symbol,
      timestamp: Date.now()
    };
    
    // Store message in room history (limit to last 50 messages)
    if (!room.messages) room.messages = [];
    room.messages.push(messageObj);
    if (room.messages.length > 50) {
      room.messages.shift(); // Remove oldest message
    }
    
    // Broadcast to all clients in the room
    io.to(roomId).emit('chatMessage', messageObj);
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Find the room this socket was in
    for (const roomId in rooms) {
      const room = rooms[roomId];
      
      // Check if disconnected user was a player
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        player.connected = false;
        player.disconnectedAt = Date.now();
        
        console.log(`Player ${player.name} disconnected from room ${roomId}`);
        
        // Update participants list
        const participantIndex = room.participants.findIndex(p => p.id === socket.id);
        if (participantIndex !== -1) {
          room.participants[participantIndex].connected = false;
        }
        
        // Notify other players
        if (room.status === RoomStatus.WAITING) {
          // In waiting room, just notify about participant leaving
          socket.to(roomId).emit('participantLeft', {
            participantName: player.name,
            participants: room.participants
          });
        } else {
          // In game, notify about player leaving
          socket.to(roomId).emit('playerLeft', {
            playerName: player.name,
            temporary: true // Assuming they might reconnect
          });
        }
        
        // Check if all players are disconnected to schedule room deletion
        const allPlayersDisconnected = room.players.every(p => !p.connected);
        if (allPlayersDisconnected) {
          console.log(`No connected players in room ${roomId}, scheduling for deletion`);
          
          // Schedule room deletion after timeout
          room.deletionTimeout = setTimeout(() => {
            delete rooms[roomId];
            console.log(`Room ${roomId} deleted after timeout`);
            
            // Update available rooms list
            io.emit('availableRooms', Object.keys(rooms));
          }, 5 * 60 * 1000); // 5 minutes
        }
      }
      
      // Check if disconnected user was a spectator
      else if (room.spectators) {
        const spectatorIndex = room.spectators.findIndex(s => s.id === socket.id);
        if (spectatorIndex !== -1) {
          const spectator = room.spectators[spectatorIndex];
          
          // Remove spectator from room
          room.spectators.splice(spectatorIndex, 1);
          
          // Remove from participants list
          const participantIndex = room.participants.findIndex(p => p.id === socket.id);
          if (participantIndex !== -1) {
            room.participants.splice(participantIndex, 1);
          }
          
          console.log(`Spectator ${spectator.name} left room ${roomId}`);
          
          // Notify others
          if (room.status === RoomStatus.WAITING) {
            // In waiting room, notify about participant leaving
            socket.to(roomId).emit('participantLeft', {
              participantName: spectator.name,
              participants: room.participants
            });
          } else {
            // In game, notify about spectator leaving
            socket.to(roomId).emit('spectatorLeft', {
              spectatorName: spectator.name
            });
          }
        }
      }
    }
    
    // Update available room list
    io.emit('availableRooms', Object.keys(rooms));
  });
});

// Utility function to check for a winner
function checkWinner(gameState) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
  ];
  
  // Check for a winner
  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (gameState[a] && gameState[a] === gameState[b] && gameState[a] === gameState[c]) {
      return gameState[a]; // Return winning symbol (X or O)
    }
  }
  
  // Check for a draw
  if (!gameState.includes('')) {
    return 'draw';
  }
  
  // Game still in progress
  return null;
}

// Utility function to get the winning combination
function getWinningCombination(gameState) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
  ];
  
  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (gameState[a] && gameState[a] === gameState[b] && gameState[a] === gameState[c]) {
      return pattern;
    }
  }
  
  return null;
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 