const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');
const session = require('express-session');

const app = express();
const PORT = 3000;

/* ================== MIDDLEWARE ================== */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// Helper for Async SQLite
const runQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const getQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const allQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};


/* ================== ROOT ================== */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


/* ================== AUTH ================== */

// Register
app.post('/api/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Missing fields' });

    try {
        const hash = await bcrypt.hash(password, 10);
        await runQuery(
            `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
            [name, email, hash, role || 'Employee']
        );
        res.json({ success: true, message: 'Registered successfully' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ success: false, message: 'Email exists' });
        res.status(500).json({ success: false, message: err.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await getQuery(`SELECT * FROM users WHERE email = ?`, [email]);
        if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const { password: _, ...userInfo } = user;
        req.session.user = userInfo;
        res.json({ success: true, user: userInfo });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Gmail Login (Simulation)
app.post('/api/auth/google', async (req, res) => {
    const { email, name } = req.body; // In real app, verify ID token here.

    try {
        let user = await getQuery(`SELECT * FROM users WHERE email = ?`, [email]);

        if (!user) {
            // Register automatically
            const placeholderPassword = await bcrypt.hash(Math.random().toString(), 10);
            await runQuery(
                `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'Employee')`,
                [name, email, placeholderPassword]
            );
            user = await getQuery(`SELECT * FROM users WHERE email = ?`, [email]);
        }

        const { password: _, ...userInfo } = user;
        req.session.user = userInfo;
        res.json({ success: true, user: userInfo });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


/* ================== TASKS ================== */

// Create Task & Notify
// Create Task & Notify
app.post('/api/tasks', async (req, res) => {
    console.log('Received Task Data:', req.body); // Debug log
    const { title, description, deadline, priority, assigned_to, created_by } = req.body;

    if (!title || !created_by) {
        return res.status(400).json({ success: false, message: 'Title and Creator ID required' });
    }

    try {
        // Handle assigned_to: if empty/null, default to created_by
        const assignee = assigned_to ? assigned_to : created_by;

        const result = await runQuery(
            `INSERT INTO tasks (title, description, deadline, priority, assigned_to, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
            [title, description, deadline, priority, assignee, created_by]
        );

        // Notify Assignee (only if assigned to someone else)
        if (assignee && assignee != created_by) {
            const creator = await getQuery(`SELECT name FROM users WHERE id = ?`, [created_by]);
            const msg = `New task assigned by ${creator ? creator.name : 'Unknown'}: ${title}`;
            await runQuery(`INSERT INTO notifications (user_id, message) VALUES (?, ?)`, [assignee, msg]);
        }

        res.json({ success: true, taskId: result.lastID, message: 'Task created successfully' });
    } catch (err) {
        console.error('Task Creation Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error: ' + err.message });
    }
});

// Get Tasks
app.get('/api/tasks', async (req, res) => {
    const { userId, role, status, search } = req.query;
    let sql = `
        SELECT t.*, uc.name as creator_name, ua.name as assignee_name 
        FROM tasks t
        JOIN users uc ON t.created_by = uc.id
        LEFT JOIN users ua ON t.assigned_to = ua.id
        WHERE 1=1
    `;
    const params = [];

    if (role === 'Employee') {
        sql += ` AND t.assigned_to = ?`;
        params.push(userId);
    } else if (role === 'Manager') {
        sql += ` AND (t.created_by = ? OR t.assigned_to = ?)`;
        params.push(userId, userId);
    }

    if (status && status !== 'All') {
        sql += ` AND t.status = ?`;
        params.push(status);
    }

    if (search) {
        sql += ` AND (t.title LIKE ? OR t.description LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY t.created_at DESC`;

    try {
        const tasks = await allQuery(sql, params);
        res.json({ success: true, tasks });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Update Status
app.post('/api/tasks/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        await runQuery(`UPDATE tasks SET status = ? WHERE id = ?`, [status, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


/* ================== COMMENTS ================== */

app.get('/api/tasks/:id/comments', async (req, res) => {
    try {
        const rows = await allQuery(
            `SELECT c.*, u.name as user_name FROM comments c JOIN users u ON c.user_id = u.id WHERE task_id = ? ORDER BY c.created_at ASC`,
            [req.params.id]
        );
        res.json({ success: true, comments: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/tasks/:id/comments', async (req, res) => {
    const { user_id, content } = req.body;
    try {
        await runQuery(
            `INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)`,
            [req.params.id, user_id, content]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


/* ================== NOTIFICATIONS ================== */

app.get('/api/notifications', async (req, res) => {
    const { userId } = req.query;
    try {
        const rows = await allQuery(
            `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        res.json({ success: true, notifications: rows });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/notifications/:id/read', async (req, res) => {
    try {
        await runQuery(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});


/* ================== REPORTS ================== */

app.get('/api/reports', async (req, res) => {
    try {
        const statusCounts = await allQuery(
            `SELECT status, COUNT(*) as count FROM tasks GROUP BY status`
        );
        const userTaskCounts = await allQuery(
            `SELECT u.name, COUNT(t.id) as count FROM users u LEFT JOIN tasks t ON u.id = t.assigned_to GROUP BY u.id`
        );

        res.json({ success: true, statusCounts, userTaskCounts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ================== GENERIC USERS LIST ================== */
app.get('/api/users', async (req, res) => {
    try {
        const rows = await allQuery('SELECT id, name, role FROM users');
        res.json({ success: true, users: rows });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

/* ================== SERVER ================== */
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`✅ Server running at http://localhost:${PORT}`);
    });
}

module.exports = app;
