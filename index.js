import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { connectDB } from './db/dbFallback.js';
import authRoutes from './routes/auth.js';
import musicRoutes from './routes/music.js';
import analyticsRoutes from './routes/analytics.js';
import chatbotRoutes from './routes/chatbot.js';
import ticketRoutes from './routes/tickets.js';

dotenv.config();

// Global Crash Prevention handlers
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception detected:', err.stack || err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection detected at:', promise, 'reason:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*', // In production, restrict this to the client domain
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Production Secure Headers (Built-in Helmet Alternative)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' http://localhost:5000 http://localhost:5173 https://api.openai.com;");
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Production IP Request Rate Limiting
const ipRequestCounts = {};
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 300; // Max 300 requests per 15 minutes per IP

app.use((req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();

  if (!ipRequestCounts[ip]) {
    ipRequestCounts[ip] = [];
  }

  // Filter timestamps older than the window
  ipRequestCounts[ip] = ipRequestCounts[ip].filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (ipRequestCounts[ip].length >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      message: 'Too many requests originating from this IP address. Please try again in 15 minutes.'
    });
  }

  ipRequestCounts[ip].push(now);
  next();
});

// Serve static uploaded files (audio files & cover art)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', musicRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/tickets', ticketRoutes);

// Payment Integration Ready Mock Endpoint
app.post('/api/payments/checkout', (req, res) => {
  const { planId, amount, currency } = req.body;
  if (!planId || !amount) {
    return res.status(400).json({ message: 'Plan ID and amount are required.' });
  }
  // This is a placeholder for stripe / razorpay / paypal checkout creation
  res.status(200).json({
    message: 'Payment checkout session created successfully (Mock API)',
    checkoutUrl: 'https://checkout.adventure-records.com/pay/' + Math.random().toString(36).substring(2, 9),
    planId,
    amount,
    currency: currency || 'INR',
    status: 'ReadyForRedirect'
  });
});

// Root API status endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      server: 'running',
      databaseMode: connectDB ? 'dual-mode' : 'local-only'
    }
  });
});

// Connect to Database & Start Server
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Adventure Records Server running on port ${PORT}`);
  });
};

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
