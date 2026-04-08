// db.js
let SQL;
let db;

// Инициализация SQL.js и базы данных
async function initDatabase() {
    if (db) return db;

    // Загружаем sql.js
    const sqlModule = await import('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js');
    SQL = sqlModule.default;

    // Пытаемся загрузить сохранённую базу из IndexedDB
    let binaryArray = null;
    try {
        const saved = await loadFromIndexedDB('testing_system_db');
        if (saved) binaryArray = new Uint8Array(saved);
    } catch (e) {
        console.warn('Не удалось загрузить из IndexedDB, создаётся новая база');
    }

    if (binaryArray) {
        db = new SQL.Database(binaryArray);
    } else {
        db = new SQL.Database();
        createTables();
    }

    // Автосохранение при изменениях (можно вызывать вручную)
    window.saveDatabase = saveDatabase;
    return db;
}

// Создание таблиц
function createTables() {
    // Учителя
    db.run(`
        CREATE TABLE IF NOT EXISTS teachers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            login TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    `);
    // Добавляем администратора по умолчанию (логин: admin, пароль: admin)
    const existing = db.exec("SELECT id FROM teachers WHERE login = 'admin'");
    if (existing.length === 0 || existing[0].values.length === 0) {
        db.run("INSERT INTO teachers (login, password_hash) VALUES (?, ?)", ['admin', hashPassword('admin')]);
    }

    // Тесты
    db.run(`
        CREATE TABLE IF NOT EXISTS tests (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            type TEXT CHECK(type IN ('fixed', 'generated')) NOT NULL,
            time_limit INTEGER NOT NULL,
            show_results INTEGER DEFAULT 1,
            created_at TEXT
        )
    `);

    // Вопросы внутри фиксированных тестов
    db.run(`
        CREATE TABLE IF NOT EXISTS test_questions (
            id TEXT PRIMARY KEY,
            test_id TEXT NOT NULL,
            title TEXT NOT NULL,
            editor_data TEXT,
            file_required INTEGER DEFAULT 0,
            position INTEGER,
            FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
        )
    `);

    // Варианты ответов для вопросов тестов
    db.run(`
        CREATE TABLE IF NOT EXISTS test_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id TEXT NOT NULL,
            answer_text TEXT NOT NULL,
            is_correct INTEGER NOT NULL,
            FOREIGN KEY (question_id) REFERENCES test_questions(id) ON DELETE CASCADE
        )
    `);

    // База заданий (глобальная)
    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            editor_data TEXT,
            file_required INTEGER DEFAULT 0,
            created_at TEXT
        )
    `);

    // Варианты ответов для заданий
    db.run(`
        CREATE TABLE IF NOT EXISTS task_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            answer_text TEXT NOT NULL,
            is_correct INTEGER NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    `);

    // Связь тестов с заданиями из базы (для generated)
    db.run(`
        CREATE TABLE IF NOT EXISTS test_tasks (
            test_id TEXT NOT NULL,
            task_id TEXT NOT NULL,
            PRIMARY KEY (test_id, task_id),
            FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    `);

    // Пользователи (ученики)
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            full_name TEXT NOT NULL,
            code TEXT UNIQUE NOT NULL,
            created_at TEXT
        )
    `);

    // Группы
    db.run(`
        CREATE TABLE IF NOT EXISTS groups_table (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        )
    `);

    // Связь пользователей с группами
    db.run(`
        CREATE TABLE IF NOT EXISTS user_groups (
            user_id TEXT NOT NULL,
            group_id TEXT NOT NULL,
            PRIMARY KEY (user_id, group_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (group_id) REFERENCES groups_table(id) ON DELETE CASCADE
        )
    `);

    // Участники теста (привязка пользователей к тесту)
    db.run(`
        CREATE TABLE IF NOT EXISTS test_participants (
            test_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            PRIMARY KEY (test_id, user_id),
            FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Сессии тестирования (активные)
    db.run(`
        CREATE TABLE IF NOT EXISTS test_sessions (
            id TEXT PRIMARY KEY,
            test_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            start_time INTEGER NOT NULL,
            remaining_seconds INTEGER NOT NULL,
            current_index INTEGER DEFAULT 0,
            answers TEXT,
            variant_questions TEXT,
            FOREIGN KEY (test_id) REFERENCES tests(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Результаты тестирования
    db.run(`
        CREATE TABLE IF NOT EXISTS test_results (
            id TEXT PRIMARY KEY,
            test_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            start_time INTEGER NOT NULL,
            end_time INTEGER NOT NULL,
            answers TEXT,
            files TEXT,
            score INTEGER,
            FOREIGN KEY (test_id) REFERENCES tests(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
}

// Хеширование пароля (простой вариант для демо)
function hashPassword(pass) {
    // Используем простой хеш (в реальном проекте нужен crypto)
    let hash = 0;
    for (let i = 0; i < pass.length; i++) {
        hash = ((hash << 5) - hash) + pass.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString(16);
}

// Проверка пароля
function verifyPassword(input, hash) {
    return hashPassword(input) === hash;
}

// Аутентификация учителя
async function authenticateTeacher(db, login, password) {
    const res = db.exec("SELECT id, password_hash FROM teachers WHERE login = ?", [login]);
    if (res.length && res[0].values.length) {
        const row = res[0].values[0];
        if (verifyPassword(password, row[1])) {
            return { success: true, teacherId: row[0] };
        }
    }
    return { success: false };
}

// Смена пароля учителя
function changeTeacherPassword(db, teacherId, newPassword) {
    const hash = hashPassword(newPassword);
    db.run("UPDATE teachers SET password_hash = ? WHERE id = ?", [hash, teacherId]);
    saveDatabase();
}

// Сохранение базы в IndexedDB
function saveDatabase() {
    if (!db) return;
    const data = db.export();
    const buffer = data.buffer;
    saveToIndexedDB('testing_system_db', buffer);
}

function saveToIndexedDB(key, buffer) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('TestingSystemDB', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('database')) {
                db.createObjectStore('database');
            }
        };
        request.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction('database', 'readwrite');
            const store = tx.objectStore('database');
            store.put(buffer, key);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e);
        };
        request.onerror = (e) => reject(e);
    });
}

function loadFromIndexedDB(key) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('TestingSystemDB', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('database')) {
                db.createObjectStore('database');
            }
        };
        request.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction('database', 'readonly');
            const store = tx.objectStore('database');
            const getReq = store.get(key);
            getReq.onsuccess = () => resolve(getReq.result);
            getReq.onerror = (e) => reject(e);
        };
        request.onerror = (e) => reject(e);
    });
}

// Вспомогательные функции для работы с базой (получение данных)
function getTests(db) {
    const res = db.exec("SELECT * FROM tests ORDER BY created_at DESC");
    if (!res.length) return [];
    return res[0].values.map(row => ({
        id: row[0], title: row[1], type: row[2], time_limit: row[3], show_results: row[4], created_at: row[5]
    }));
}

function getTasks(db) {
    const res = db.exec("SELECT * FROM tasks ORDER BY created_at DESC");
    if (!res.length) return [];
    return res[0].values.map(row => ({
        id: row[0], title: row[1], editor_data: row[2], file_required: row[3], created_at: row[4]
    }));
}

function getUsers(db) {
    const res = db.exec("SELECT * FROM users ORDER BY full_name");
    if (!res.length) return [];
    return res[0].values.map(row => ({
        id: row[0], full_name: row[1], code: row[2], created_at: row[3]
    }));
}

function getGroups(db) {
    const res = db.exec("SELECT * FROM groups_table ORDER BY name");
    if (!res.length) return [];
    return res[0].values.map(row => ({ id: row[0], name: row[1] }));
}

// Генерация уникального кода участника
function generateUserCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Инициализация при загрузке
window.initDatabase = initDatabase;