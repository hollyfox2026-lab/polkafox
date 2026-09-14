import { config } from "./config.js";
import { openDatabase } from "./db.js";
import { createStorage } from "./storage.js";
import { createApp } from "./app.js";

const db = openDatabase(config.dbPath);
const storage = createStorage({
  provider: config.storageProvider,
  uploadsDir: config.uploadsDir,
});

const app = createApp({
  db,
  storage,
  publicDir: config.publicDir,
  uploadsDir: config.uploadsDir,
});

app.listen(config.port, config.host, () => {
  console.log(`Полка запущена на http://${config.host}:${config.port}`);
  console.log(`База данных: ${config.dbPath}`);
  console.log(`Хранилище фото: ${storage.name}`);
});
