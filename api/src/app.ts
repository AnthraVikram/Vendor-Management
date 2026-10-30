import express from 'express';
import cors from 'cors';
import { loadConfig } from './config';
import { errorMiddleware } from './middleware/error';
import { requireRole, sessionMiddleware } from './middleware/session';
import { publicAuthRouter, authRouter } from './modules/auth/routes';
import { staffRouter } from './modules/staff/routes';
import { categoryRouter, vendorRouter } from './modules/vendors/routes';
import { projectRouter } from './modules/projects/routes';
import { linkRouter } from './modules/links/routes';
import { scheduleRouter } from './modules/schedules/routes';
import { fileRouter } from './modules/files/routes';
import { timelineRouter } from './modules/timeline/routes';
import { dashboardRouter } from './modules/dashboard/routes';
import { clientAdvanceRouter } from './modules/client-advances/routes';
import { vendorImportRouter } from './modules/vendor-imports/routes';
import { documentRouter } from './modules/documents/routes';
import { historyRouter } from './modules/history/routes';

export function createApp() {
  const config = loadConfig();
  const app = express();
  app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
  app.use(express.json());
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/auth', publicAuthRouter);
  app.use(sessionMiddleware);
  app.use('/api/auth', authRouter);
  app.use('/api/staff', requireRole('ADMINISTRATOR'), staffRouter);
  app.use('/api/categories', categoryRouter);
  app.use('/api/vendors', vendorRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api', linkRouter);
  app.use('/api', scheduleRouter);
  app.use('/api', fileRouter);
  app.use('/api', timelineRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', clientAdvanceRouter);
  app.use('/api', vendorImportRouter);
  app.use('/api', documentRouter);
  app.use('/api', historyRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ message: 'Not found.' });
  });
  app.use(errorMiddleware);
  return app;
}
