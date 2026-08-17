const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { MongoStore } = require('connect-mongo');
const authRoutes = require('./auth');
const apiRoutes = require('./api');

function createApp({ client }) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: 'auto'
      }
    })
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de login. Espera 15 minutos.' }
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones. Intenta de nuevo en un minuto.' }
  });

  app.use('/api/auth/mega-admin/login', authLimiter);
  app.use('/api', apiLimiter);

  app.set('client', client);

  app.use('/api/auth', authRoutes);
  app.use('/api', apiRoutes);

  app.use(express.static(path.join(__dirname, '../../public')));

  app.get('/denied', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/denied.html'));
  });

  app.get('/activity', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/activity.html'));
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      console.error('[HTTP] error tras enviar respuesta:', err.message);
      return res.end();
    }
    console.error('[HTTP] error:', err.stack || err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}

module.exports = { createApp };
