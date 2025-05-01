# Tic-Tac-Toe Online

A real-time multiplayer Tic-Tac-Toe game with Node.js, Express, and Socket.IO.

## Features

- Create and join game rooms
- Real-time gameplay with WebSockets
- Room-based matchmaking system
- Random matchmaking
- Spectator mode
- In-game chat
- Score tracking
- Mobile-responsive design

## Project Structure

```
tic-tac-toe-online/
├── server.js          # Main server file with all game logic
├── index.html         # Home page
├── game.html          # Game page
├── waiting.html       # Waiting room page
├── style.css          # CSS styling
├── script.js          # Client-side JavaScript
├── package.json       # Dependencies and scripts
└── README.md          # This file
```

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

## Running the Game

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The server will start on http://localhost:3000 by default.

## How to Play

1. Open the game URL in your browser
2. Choose "Create New Game" and enter your name
3. Share the generated game link with a friend
4. Your friend opens the link and enters their name
5. Play the game!

## Technologies Used

- Node.js
- Express.js
- Socket.io
- HTML5
- CSS3
- JavaScript

## Deployment

You can deploy this application to platforms like:
- Heroku
- Vercel
- Railway
- Render

Make sure to set the PORT environment variable if your hosting platform requires it. 