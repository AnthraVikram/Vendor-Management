import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = createApp();
app.listen(config.API_PORT, () => {
  console.log(`API listening on ${config.API_PORT}`);
});
