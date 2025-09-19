const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Store active subtitle sessions
const activeSessions = new Map();

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    const sessionId = generateSessionId();
    console.log(`New subtitle session connected: ${sessionId}`);

    // Store session
    activeSessions.set(sessionId, {
        ws,
        startTime: Date.now(),
        language: 'en-US',
        isActive: false
    });

    // Send session ID to client
    ws.send(JSON.stringify({
        type: 'session_init',
        sessionId,
        timestamp: Date.now()
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleWebSocketMessage(sessionId, data);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });

    ws.on('close', () => {
        console.log(`Subtitle session disconnected: ${sessionId}`);
        activeSessions.delete(sessionId);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for session ${sessionId}:`, error);
        activeSessions.delete(sessionId);
    });
});

function handleWebSocketMessage(sessionId, data) {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    const { ws } = session;

    switch (data.type) {
        case 'start_listening':
            session.isActive = true;
            session.language = data.language || 'en-US';
            session.startTime = Date.now();

            ws.send(JSON.stringify({
                type: 'listening_started',
                timestamp: Date.now(),
                language: session.language
            }));
            break;

        case 'stop_listening':
            session.isActive = false;

            ws.send(JSON.stringify({
                type: 'listening_stopped',
                timestamp: Date.now()
            }));
            break;

        case 'subtitle_update':
            // Relay subtitle updates to other connected clients if needed
            broadcastSubtitle(sessionId, data);
            break;

        case 'ping':
            ws.send(JSON.stringify({
                type: 'pong',
                timestamp: Date.now(),
                latency: Date.now() - data.timestamp
            }));
            break;

        default:
            ws.send(JSON.stringify({
                type: 'error',
                message: `Unknown message type: ${data.type}`
            }));
    }
}

function broadcastSubtitle(senderSessionId, subtitleData) {
    const senderSession = activeSessions.get(senderSessionId);
    if (!senderSession) return;

    // Add server timestamp and session info
    const broadcastData = {
        ...subtitleData,
        serverTimestamp: Date.now(),
        sessionId: senderSessionId
    };

    // Broadcast to all other active sessions (for multi-user scenarios)
    activeSessions.forEach((session, sessionId) => {
        if (sessionId !== senderSessionId && session.isActive) {
            try {
                session.ws.send(JSON.stringify(broadcastData));
            } catch (error) {
                console.error(`Error broadcasting to session ${sessionId}:`, error);
            }
        }
    });
}

function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}

// REST API endpoints
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: Date.now(),
        activeSessions: activeSessions.size,
        uptime: process.uptime()
    });
});

app.get('/api/sessions', (req, res) => {
    const sessions = Array.from(activeSessions.entries()).map(([id, session]) => ({
        id,
        startTime: session.startTime,
        language: session.language,
        isActive: session.isActive,
        uptime: Date.now() - session.startTime
    }));

    res.json({
        sessions,
        total: sessions.length,
        active: sessions.filter(s => s.isActive).length
    });
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message
    });
});

// Handle 404s
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        path: req.path
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Live Subtitle Server running on port ${PORT}`);
    console.log(`Frontend available at: http://localhost:${PORT}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');

    // Close all WebSocket connections
    activeSessions.forEach((session, sessionId) => {
        try {
            session.ws.send(JSON.stringify({
                type: 'server_shutdown',
                message: 'Server is shutting down'
            }));
            session.ws.close();
        } catch (error) {
            console.error(`Error closing session ${sessionId}:`, error);
        }
    });

    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    process.exit(0);
});
