import express, { Application } from 'express';
import cors from 'cors';
import routes from './routes';
import { traceMiddleware } from './middleware/trace.middleware';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';

const app: Application = express();

// Middleware
app.use(traceMiddleware);
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', routes);

// Centralized Error & 404 Handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
