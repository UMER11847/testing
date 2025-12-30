// public/js/tasks.js

const userId = localStorage.getItem('userId');
const userRole = localStorage.getItem('userRole');
const userName = localStorage.getItem('userName');

// --- Initial Checks ---
if (!userId || !userRole) {
    alert('You must be logged in to view the dashboard.');
    window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    // Set welcome message and handle logout
    document.getElementById('welcomeMessage').textContent = `Welcome, ${userName} (${userRole})!`;
    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = 'index.html';
    });

    // Show/Hide Task Creation (Req. 2)
    // Show/Hide Task Creation (Req. 2)
    const createTaskSection = document.getElementById('createTaskSection');
    // Allow ALL logged in users to create tasks to fulfill "Create task" requirement
    createTaskSection.classList.remove('hidden');

    // --- Task Creation Logic ---
    const taskForm = document.getElementById('taskForm');
    taskForm?.addEventListener('submit', async e => {
        e.preventDefault();

        const f = new FormData(taskForm);

        const taskData = {
            title: f.get('title'),
            description: f.get('description'),
            deadline: f.get('deadline'),
            priority: f.get('priority'),
            assigned_to: f.get('assigned_to'),
            created_by: userId
        };

        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });

        const result = await res.json();

        if (result.success) {
            alert('Task created successfully!');
            taskForm.reset();
            fetchAndDisplayTasks();
        } else {
            alert(result.message || 'Task creation failed.');
        }
    });

    // --- Fetch and Filter Logic ---
    document.getElementById('applyFilters').addEventListener('click', fetchAndDisplayTasks);
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') fetchAndDisplayTasks();
    });

    async function fetchAndDisplayTasks() {
        const status = document.getElementById('statusFilter').value;
        const search = document.getElementById('searchInput').value;
        const query = new URLSearchParams({ userId, role: userRole, status, search });

        const res = await fetch(`/api/tasks?${query.toString()}`);
        const data = await res.json();
        const taskList = document.getElementById('taskList');
        taskList.innerHTML = '';

        if (data.success && data.tasks.length > 0) {
            data.tasks.forEach(task => {
                const taskEl = document.createElement('div');
                taskEl.className = `task-card priority-${task.priority.toLowerCase().replace(' ', '-')}`;
                taskEl.innerHTML = `
                    <h4>${task.title} (ID: ${task.id})</h4>
                    <p>${task.description || 'No description'}</p>
                    <p>Deadline: ${task.deadline || 'N/A'} | Priority: <strong>${task.priority}</strong></p>
                    <p>Status: <span id="status-${task.id}">${task.status}</span></p>
                    <p>Assigned To: ${task.assignee_name || 'Unassigned'} | Created By: ${task.creator_name}</p>
                    
                    <div class="status-update-controls">
                        <select id="statusSelect-${task.id}" class="status-select">
                            <option value="Pending" ${task.status === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                            <option value="Completed" ${task.status === 'Completed' ? 'selected' : ''}>Completed</option>
                        </select>
                        <button class="button small update-status-btn" data-task-id="${task.id}">Update Status</button>
                    </div>

                    <div class="comments-section">
                        <button class="button secondary small toggle-comments" data-task-id="${task.id}">💬 Comments</button>
                        <div id="comments-${task.id}" class="comments-list hidden">
                            <!-- Comments loaded here -->
                        </div>
                    </div>
                `;
                taskList.appendChild(taskEl);
            });

            document.querySelectorAll('.update-status-btn').forEach(btn => btn.addEventListener('click', updateTaskStatus));
            document.querySelectorAll('.toggle-comments').forEach(btn => btn.addEventListener('click', toggleComments));

        } else {
            taskList.innerHTML = '<p>No tasks found.</p>';
        }
    }

    async function updateTaskStatus(e) {
        const taskId = e.target.getAttribute('data-task-id');
        const newStatus = document.getElementById(`statusSelect-${taskId}`).value;

        const res = await fetch(`/api/tasks/${taskId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });

        const result = await res.json();
        if (result.success) {
            document.getElementById(`status-${taskId}`).textContent = newStatus;
            alert('Status updated!');
        } else {
            alert('Failed to update status.');
        }
    }

    // --- Comments Logic ---
    async function toggleComments(e) {
        const taskId = e.target.getAttribute('data-task-id');
        const container = document.getElementById(`comments-${taskId}`);

        if (container.classList.contains('hidden')) {
            container.classList.remove('hidden');

            // Load comments
            const res = await fetch(`/api/tasks/${taskId}/comments`);
            const data = await res.json();

            let html = '<ul class="comment-list">';
            if (data.comments && data.comments.length > 0) {
                data.comments.forEach(c => {
                    html += `<li><strong>${c.user_name}:</strong> ${c.content}</li>`;
                });
            } else {
                html += '<li>No comments yet.</li>';
            }
            html += '</ul>';

            // Add input
            html += `
                <div class="add-comment">
                    <input type="text" id="commentInput-${taskId}" placeholder="Add a comment...">
                    <button class="button small post-comment-btn" data-task-id="${taskId}">Post</button>
                </div>
            `;

            container.innerHTML = html;
            container.querySelector('.post-comment-btn').addEventListener('click', postComment);
        } else {
            container.classList.add('hidden');
        }
    }

    async function postComment(e) {
        const taskId = e.target.getAttribute('data-task-id');
        const content = document.getElementById(`commentInput-${taskId}`).value;
        if (!content) return;

        const res = await fetch(`/api/tasks/${taskId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, content })
        });

        if (res.ok) {
            // refresh comments view
            e.target.closest('.comments-list').classList.add('hidden');
            // Toggle twice to reload (hacky but simple)
            const toggleBtn = document.querySelector(`.toggle-comments[data-task-id="${taskId}"]`);
            toggleBtn.click(); toggleBtn.click();
        }
    }

    // --- Notifications Logic ---
    const notifBtn = document.getElementById('notificationBtn');
    const notifPanel = document.getElementById('notificationPanel');
    const closeNotifBtn = document.getElementById('closeNotifBtn');

    notifBtn.addEventListener('click', async () => {
        notifPanel.classList.toggle('hidden');
        if (!notifPanel.classList.contains('hidden')) {
            const res = await fetch(`/api/notifications?userId=${userId}`);
            const data = await res.json();
            const list = document.getElementById('notificationList');

            list.innerHTML = '';
            if (data.notifications && data.notifications.length > 0) {
                data.notifications.forEach(n => {
                    const item = document.createElement('div');
                    item.className = `notif-item ${n.is_read ? 'read' : 'unread'}`;
                    item.textContent = n.message;
                    if (!n.is_read) {
                        item.addEventListener('click', async () => {
                            await fetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
                            item.classList.remove('unread');
                        });
                    }
                    list.appendChild(item);
                });
            } else {
                list.innerHTML = '<p>No notifications.</p>';
            }
        }
    });

    closeNotifBtn.addEventListener('click', () => notifPanel.classList.add('hidden'));

    // --- Reports Logic ---
    const reportsBtn = document.getElementById('reportsBtn');
    const reportsSection = document.getElementById('reportsSection');
    const closeReportsBtn = document.getElementById('closeReportsBtn');

    reportsBtn.addEventListener('click', async () => {
        reportsSection.classList.toggle('hidden');
        if (!reportsSection.classList.contains('hidden')) {
            const res = await fetch('/api/reports');
            const data = await res.json();

            const statusList = document.getElementById('statusReportList');
            statusList.innerHTML = data.statusCounts.map(s => `<li>${s.status}: ${s.count}</li>`).join('');

            const userList = document.getElementById('userReportList');
            userList.innerHTML = data.userTaskCounts.map(u => `<li>${u.name}: ${u.count} tasks</li>`).join('');
        }
    });

    closeReportsBtn.addEventListener('click', () => reportsSection.classList.add('hidden'));

    fetchAndDisplayTasks();
});
