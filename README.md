# Online Multiplayer Tic-Tac-Toe

A real-time multiplayer Tic-Tac-Toe game with rooms where players can create and join games from anywhere.

## Features

- Create and join game rooms
- Real-time gameplay with WebSockets
- Room-based matchmaking system
- Score tracking
- Beautiful UI with animations
- Mobile-responsive design

## How It Works

1. Players can create a new game room or join an existing one
2. Each room has a unique ID that can be shared with friends
3. Real-time game updates using Socket.io
4. Players take turns making moves
5. Score tracking between matches

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

## Project Structure

- `server.js`: Main server file with Socket.io logic
- `index.html`: Lobby page for creating/joining games
- `game.html`: The actual game board
- `style.css`: Styling for the game

## Deployment

You can deploy this application to platforms like:
- Heroku
- Vercel
- Railway
- Render

Make sure to set the PORT environment variable if your hosting platform requires it. 