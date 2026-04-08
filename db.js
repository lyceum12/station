// db.js - работа с SQLite через sql.js
let db = null;
let dbReady = false;
let dbCallbacks = [];

// Инициализация БД (создание таблиц)
async function initDatabase() {
    if (dbReady) return;
    // Загружаем SQL.js
    const SQL = await initSqlJs({
        locateFile: file => `https://sql.js.org/dist/${file}`
    });
    // Пытаемся загрузить сохранённую базу из localStorage (как бинарные данные)
    let savedData = localStorage.getItem('sqlite_db');
    let uint8Array;
    if (savedData) {
        const binaryString = atob(savedData);
        uint8Array = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            uint8Array[i] = binaryString.charCodeAt(i);
        }
    }
    if (uint8Array) {
        db = new SQL.Database(uint8Array);
    } else {
        db = new SQL.Database();
        // Создаём таблицы
        db.run(`CREATE TABLE IF NOT EXISTS tests (id TEXT PRIMARY KEY, data TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS tasks_base (id TEXT PRIMARY KEY, data TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT)`);
        // Начальные данные
        const defaultTests = [];
        const defaultUsers = { groups: [], users: [] };
        const defaultTasks = [];
        const defaultSessions = [];
        db.run("INSERT OR REPLACE INTO tests (id, data) VALUES (?, ?)", ['all_tests', JSON.stringify(defaultTests)]);
        db.run("INSERT OR REPLACE INTO users (id, data) VALUES (?, ?)", ['all_users', JSON.stringify(defaultUsers)]);
        db.run("INSERT OR REPLACE INTO tasks_base (id, data) VALUES (?, ?)", ['all_tasks', JSON.stringify(defaultTasks)]);
        db.run("INSERT OR REPLACE INTO sessions (id, data) VALUES (?, ?)", ['all_sessions', JSON.stringify(defaultSessions)]);
        saveDatabaseToLocalStorage();
    }
    dbReady = true;
    dbCallbacks.forEach(cb => cb());
    dbCallbacks = [];
}

function saveDatabaseToLocalStorage() {
    if (!db) return;
    const binaryArray = db.export();
    const base64 = btoa(String.fromCharCode.apply(null, binaryArray));
    localStorage.setItem('sqlite_db', base64);
}

function onDbReady(callback) {
    if (dbReady) callback();
    else dbCallbacks.push(callback);
}

// CRUD для тестов
async function getTests() {
    await initDatabase();
    const result = db.exec("SELECT data FROM tests WHERE id = 'all_tests'");
    if (result.length === 0) return [];
    return JSON.parse(result[0].values[0][0]);
}
async function saveTests(tests) {
    await initDatabase();
    db.run("INSERT OR REPLACE INTO tests (id, data) VALUES (?, ?)", ['all_tests', JSON.stringify(tests)]);
    saveDatabaseToLocalStorage();
}
async function getUsers() {
    await initDatabase();
    const result = db.exec("SELECT data FROM users WHERE id = 'all_users'");
    if (result.length === 0) return { groups: [], users: [] };
    return JSON.parse(result[0].values[0][0]);
}
async function saveUsers(usersObj) {
    await initDatabase();
    db.run("INSERT OR REPLACE INTO users (id, data) VALUES (?, ?)", ['all_users', JSON.stringify(usersObj)]);
    saveDatabaseToLocalStorage();
}
async function getTasksBase() {
    await initDatabase();
    const result = db.exec("SELECT data FROM tasks_base WHERE id = 'all_tasks'");
    if (result.length === 0) return [];
    return JSON.parse(result[0].values[0][0]);
}
async function saveTasksBase(tasks) {
    await initDatabase();
    db.run("INSERT OR REPLACE INTO tasks_base (id, data) VALUES (?, ?)", ['all_tasks', JSON.stringify(tasks)]);
    saveDatabaseToLocalStorage();
}
async function getSessions() {
    await initDatabase();
    const result = db.exec("SELECT data FROM sessions WHERE id = 'all_sessions'");
    if (result.length === 0) return [];
    return JSON.parse(result[0].values[0][0]);
}
async function saveSessions(sessions) {
    await initDatabase();
    db.run("INSERT OR REPLACE INTO sessions (id, data) VALUES (?, ?)", ['all_sessions', JSON.stringify(sessions)]);
    saveDatabaseToLocalStorage();
}
// Экспорт/импорт файла .db
function exportDatabase() {
    if (!db) return;
    const binaryArray = db.export();
    const blob = new Blob([binaryArray], { type: 'application/x-sqlite3' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'test_constructor.db';
    link.click();
    URL.revokeObjectURL(link.href);
}
async function importDatabase(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const arrayBuffer = e.target.result;
            const uint8Array = new Uint8Array(arrayBuffer);
            const SQL = await initSqlJs({
                locateFile: file => `https://sql.js.org/dist/${file}`
            });
            db = new SQL.Database(uint8Array);
            // Проверим, что таблицы существуют, если нет – создадим
            try {
                db.run("SELECT * FROM tests");
            } catch(e) {
                db.run(`CREATE TABLE IF NOT EXISTS tests (id TEXT PRIMARY KEY, data TEXT)`);
                db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT)`);
                db.run(`CREATE TABLE IF NOT EXISTS tasks_base (id TEXT PRIMARY KEY, data TEXT)`);
                db.run(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT)`);
            }
            saveDatabaseToLocalStorage();
            dbReady = true;
            resolve();
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}
