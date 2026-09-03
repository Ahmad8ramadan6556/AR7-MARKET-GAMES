// db.js - قاعدة بيانات بسيطة بصيغة JSON (لا تحتاج أي تجميع/Compile)
const fs = require(`fs`);
const path = require(`path`);

const DB_FILE = path.join(__dirname, `store.json`);

const DEFAULT_DATA = {
  users: [],
  sections: [],
  products: [],
  custom_buttons: [],
  orders: [],
  wallet_requests: [],
  notifications: [],
  next_id: {
    users: 1,
    sections: 1,
    products: 1,
    custom_buttons: 1,
    orders: 1,
    wallet_requests: 1,
    notifications: 1
  }
};

function load() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
  const raw = fs.readFileSync(DB_FILE, `utf8`);
  return JSON.parse(raw);
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function nextId(data, table) {
  const id = data.next_id[table];
  data.next_id[table] = id + 1;
  return id;
}

function nowStr() {
  return new Date().toISOString();
}

module.exports = {
  load,
  save,
  nextId,
  nowStr
};
