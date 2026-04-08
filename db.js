let db = null;
let dbInitPromise = null;

function initDatabase() {
    if (db) return Promise.resolve(db);
    if (dbInitPromise) return dbInitPromise;
    dbInitPromise = initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` })
        .then(SQL => {
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
                db.run(`CREATE TABLE IF NOT EXISTS tests (id TEXT PRIMARY KEY, data TEXT)`);
                db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT)`);
                db.run(`CREATE TABLE IF NOT EXISTS tasks_base (id TEXT PRIMARY KEY, data TEXT)`);
                db.run(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT)`);
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
            return db;
        });
    return dbInitPromise;
}

function saveDatabaseToLocalStorage() {
    if (!db) return;
    const binaryArray = db.export();
    const base64 = btoa(String.fromCharCode.apply(null, binaryArray));
    localStorage.setItem('sqlite_db', base64);
}

function getTests() {
    return initDatabase().then(() => {
        const result = db.exec("SELECT data FROM tests WHERE id = 'all_tests'");
        return result.length ? JSON.parse(result[0].values[0][0]) : [];
    });
}

function saveTests(tests) {
    return initDatabase().then(() => {
        db.run("INSERT OR REPLACE INTO tests (id, data) VALUES (?, ?)", ['all_tests', JSON.stringify(tests)]);
        saveDatabaseToLocalStorage();
    });
}

function getUsers() {
    return initDatabase().then(() => {
        const result = db.exec("SELECT data FROM users WHERE id = 'all_users'");
        return result.length ? JSON.parse(result[0].values[0][0]) : { groups: [], users: [] };
    });
}

function saveUsers(usersObj) {
    return initDatabase().then(() => {
        db.run("INSERT OR REPLACE INTO users (id, data) VALUES (?, ?)", ['all_users', JSON.stringify(usersObj)]);
        saveDatabaseToLocalStorage();
    });
}

function getTasksBase() {
    return initDatabase().then(() => {
        const result = db.exec("SELECT data FROM tasks_base WHERE id = 'all_tasks'");
        return result.length ? JSON.parse(result[0].values[0][0]) : [];
    });
}

function saveTasksBase(tasks) {
    return initDatabase().then(() => {
        db.run("INSERT OR REPLACE INTO tasks_base (id, data) VALUES (?, ?)", ['all_tasks', JSON.stringify(tasks)]);
        saveDatabaseToLocalStorage();
    });
}

function getSessions() {
    return initDatabase().then(() => {
        const result = db.exec("SELECT data FROM sessions WHERE id = 'all_sessions'");
        return result.length ? JSON.parse(result[0].values[0][0]) : [];
    });
}

function saveSessions(sessions) {
    return initDatabase().then(() => {
        db.run("INSERT OR REPLACE INTO sessions (id, data) VALUES (?, ?)", ['all_sessions', JSON.stringify(sessions)]);
        saveDatabaseToLocalStorage();
    });
}

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

function importDatabase(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const uint8Array = new Uint8Array(e.target.result);
            initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` })
                .then(SQL => {
                    db = new SQL.Database(uint8Array);
                    try {
                        db.run("SELECT * FROM tests");
                    } catch(e) {
                        db.run(`CREATE TABLE IF NOT EXISTS tests (id TEXT PRIMARY KEY, data TEXT)`);
                        db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT)`);
                        db.run(`CREATE TABLE IF NOT EXISTS tasks_base (id TEXT PRIMARY KEY, data TEXT)`);
                        db.run(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT)`);
                    }
                    saveDatabaseToLocalStorage();
                    dbInitPromise = null;
                    resolve();
                }).catch(reject);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}
