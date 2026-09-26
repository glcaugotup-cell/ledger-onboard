const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');

const env = require('./config/env');
const apiRouter = require('./routes');
const MediaController = require('./controllers/shared/MediaController');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

if (env.trustProxy) app.set('trust proxy', env.trustProxy);

// Security headers on every response.
app.use(helmet());

// Only the configured frontend origin(s) may call the API with credentials.
app.use(
  cors({
    origin: env.clientOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Strip any keys starting with '$' or containing '.' from req.body/query/params
// to block NoSQL operator injection.
app.use(mongoSanitize());

if (!env.isTest) {
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
}

// Public property photos/videos, read from GridFS. Payment proofs and business
// documents are never served here — only through their authenticated routes.
// cross-origin CORP lets the separately hosted frontend display these public images.
app.get(
  '/uploads/properties/:filename',
  (req, res, next) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  MediaController.getPropertyMedia
);

app.get('/health', (req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok', env: env.nodeEnv }, error: null });
});

app.use('/api', apiRouter);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
