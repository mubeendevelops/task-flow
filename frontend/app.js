// Priority weights for sorting
const PRIORITY_WEIGHTS = {
    high: 3,
    medium: 2,
    low: 1
};

// Global state
let allTasks = [];
let currentFilter = 'all';
let currentSort = 'priority';

// Get JWT token from localStorage
function getToken() {
    return localStorage.getItem('token');
}

// Get email from localStorage
function getEmail() {
    return localStorage.getItem('email');
}

// Check if user is authenticated
function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Make authenticated API request
async function apiRequest(url, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('email');
        window.location.href = 'login.html';
        return null;
    }

    return response;
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return null;
    
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);
    
    const diffTime = taskDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
        return { text: 'Overdue', class: 'overdue', date: dateString };
    } else if (diffDays === 0) {
        return { text: 'Today', class: 'today', date: dateString };
    } else if (diffDays === 1) {
        return { text: 'Tomorrow', class: '', date: dateString };
    } else if (diffDays <= 7) {
        return { text: `In ${diffDays} days`, class: '', date: dateString };
    } else {
        return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), class: '', date: dateString };
    }
}

// Check if task is overdue
function isOverdue(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date < today;
}

// Sort tasks
function sortTasks(tasks, sortBy) {
    const sorted = [...tasks];
    
    switch (sortBy) {
        case 'priority':
            return sorted.sort((a, b) => {
                if (a.completed !== b.completed) {
                    return a.completed ? 1 : -1;
                }
                return PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
            });
        case 'date':
            return sorted.sort((a, b) => {
                if (a.completed !== b.completed) {
                    return a.completed ? 1 : -1;
                }
                if (!a.due_date && !b.due_date) return 0;
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return new Date(a.due_date) - new Date(b.due_date);
            });
        case 'created':
            return sorted.sort((a, b) => {
                if (a.completed !== b.completed) {
                    return a.completed ? 1 : -1;
                }
                if (!a.created_at && !b.created_at) return 0;
                if (!a.created_at) return 1;
                if (!b.created_at) return -1;
                return new Date(b.created_at) - new Date(a.created_at);
            });
        default:
            return sorted;
    }
}

// Filter tasks
function filterTasks(tasks, filter) {
    switch (filter) {
        case 'active':
            return tasks.filter(task => !task.completed);
        case 'completed':
            return tasks.filter(task => task.completed);
        default:
            return tasks;
    }
}

// Fetch all tasks
async function fetchTasks() {
    const response = await apiRequest('/tasks');
    if (!response) return [];

    if (!response.ok) {
        console.error('Failed to fetch tasks');
        return [];
    }

    const tasks = await response.json();
    return tasks;
}

// Add a new task
async function addTask(text, priority, dueDate) {
    const response = await apiRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify({ text, priority, due_date: dueDate || null }),
    });

    if (!response) return null;

    if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to add task');
        return null;
    }

    return await response.json();
}

// Update a task
async function updateTask(taskId, updates) {
    const response = await apiRequest(`/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });

    if (!response) return null;

    if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to update task');
        return null;
    }

    return await response.json();
}

// Delete a task
async function deleteTask(taskId) {
    const response = await apiRequest(`/tasks/${taskId}`, {
        method: 'DELETE',
    });

    if (!response) return false;

    if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to delete task');
        return false;
    }

    return true;
}

// Delete all tasks
async function deleteAllTasks() {
    const response = await apiRequest('/tasks', {
        method: 'DELETE',
    });

    if (!response) return false;

    if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to delete all tasks');
        return false;
    }

    return true;
}

// Render tasks to the DOM
function renderTasks(tasks) {
    const container = document.getElementById('tasksContainer');

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                <p>No tasks found. Add one above to get started!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = tasks.map(task => {
        const dateInfo = formatDate(task.due_date);
        const overdue = isOverdue(task.due_date) && !task.completed;
        const taskClasses = [
            task.completed ? 'completed' : '',
            overdue ? 'overdue' : ''
        ].filter(Boolean).join(' ');

        return `
            <div class="task-item ${taskClasses}" data-id="${task.id}">
                <input 
                    type="checkbox" 
                    class="task-checkbox" 
                    ${task.completed ? 'checked' : ''}
                    onchange="toggleTaskComplete(${task.id}, this.checked)"
                >
                <div class="task-content">
                    <span class="task-text">${escapeHtml(task.text)}</span>
                    <div class="task-meta">
                        <span class="task-priority ${task.priority}">${task.priority}</span>
                        ${dateInfo ? `
                            <span class="task-date ${dateInfo.class}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                                ${dateInfo.text}
                            </span>
                        ` : ''}
                    </div>
                </div>
                <div class="task-actions">
                    <button class="btn btn-danger" onclick="handleDeleteTask(${task.id})">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Update task count
function updateTaskCount() {
    const count = allTasks.filter(t => !t.completed).length;
    const countElement = document.getElementById('taskCount');
    const deleteAllBtn = document.getElementById('deleteAllBtn');
    
    if (countElement) {
        countElement.textContent = `${count} ${count === 1 ? 'task' : 'tasks'}`;
    }
    
    // Show/hide delete all button based on whether there are tasks
    if (deleteAllBtn) {
        if (allTasks.length > 0) {
            deleteAllBtn.style.display = 'inline-flex';
        } else {
            deleteAllBtn.style.display = 'none';
        }
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Toggle task completion
async function toggleTaskComplete(taskId, completed) {
    await updateTask(taskId, { completed });
    await loadTasks();
}

// Handle delete task
async function handleDeleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) {
        return;
    }

    const success = await deleteTask(taskId);
    if (success) {
        await loadTasks();
    }
}

// Handle delete all tasks
async function handleDeleteAllTasks() {
    const taskCount = allTasks.length;
    if (taskCount === 0) {
        return;
    }
    
    const confirmed = confirm(
        `⚠️ WARNING: This will permanently delete ALL ${taskCount} task${taskCount === 1 ? '' : 's'}.\n\n` +
        `This action cannot be undone. Are you absolutely sure?`
    );
    
    if (!confirmed) {
        return;
    }
    
    // Double confirmation for safety
    const doubleConfirm = confirm(
        `Are you REALLY sure you want to delete all ${taskCount} task${taskCount === 1 ? '' : 's'}?\n\n` +
        `This cannot be undone!`
    );
    
    if (!doubleConfirm) {
        return;
    }
    
    const deleteAllBtn = document.getElementById('deleteAllBtn');
    if (deleteAllBtn) {
        deleteAllBtn.disabled = true;
        const originalHTML = deleteAllBtn.innerHTML;
        deleteAllBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Deleting...';
        
        const success = await deleteAllTasks();
        
        if (success) {
            await loadTasks();
        } else {
            deleteAllBtn.disabled = false;
            deleteAllBtn.innerHTML = originalHTML;
        }
    }
}

// Load and display tasks
async function loadTasks() {
    const container = document.getElementById('tasksContainer');
    container.innerHTML = '<p class="loading">Loading tasks...</p>';

    allTasks = await fetchTasks();
    updateTaskCount();
    
    // Apply filter and sort
    let filteredTasks = filterTasks(allTasks, currentFilter);
    filteredTasks = sortTasks(filteredTasks, currentSort);
    
    renderTasks(filteredTasks);
}

// Initialize the app
async function init() {
    // Check authentication
    if (!checkAuth()) {
        return;
    }

    // Display email
    const email = getEmail();
    if (email) {
        document.getElementById('emailDisplay').textContent = email;
    }

    // Setup logout button
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('email');
        window.location.href = 'index.html';
    });

    // Setup filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            loadTasks();
        });
    });

    // Setup sort select
    document.getElementById('sortBy').addEventListener('change', (e) => {
        currentSort = e.target.value;
        loadTasks();
    });
    
    // Setup delete all button
    const deleteAllBtn = document.getElementById('deleteAllBtn');
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', handleDeleteAllTasks);
    }

    // Setup task form
    document.getElementById('taskForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const textInput = document.getElementById('taskText');
        const prioritySelect = document.getElementById('taskPriority');
        const dateInput = document.getElementById('taskDate');
        
        const text = textInput.value.trim();
        const priority = prioritySelect.value;
        const dueDate = dateInput.value || null;

        if (!text) {
            alert('Please enter a task description');
            return;
        }

        // Disable form during submission
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Adding...';

        const newTask = await addTask(text, priority, dueDate);

        if (newTask) {
            textInput.value = '';
            prioritySelect.value = 'medium';
            dateInput.value = '';
            await loadTasks();
        }

        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    });

    // Setup date picker button (makes picking a date obvious on all themes)
    const dateInput = document.getElementById('taskDate');
    const datePickerBtn = document.getElementById('datePickerBtn');
    if (dateInput && datePickerBtn) {
        datePickerBtn.addEventListener('click', () => {
            // Chromium supports showPicker(); fallback to focus/click for other browsers
            if (typeof dateInput.showPicker === 'function') {
                dateInput.showPicker();
            } else {
                dateInput.focus();
                dateInput.click();
            }
        });
    }

    // Set minimum date to today
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.setAttribute('min', today);
    }

    // Load initial tasks
    await loadTasks();
}

// Make functions available globally for inline event handlers
window.toggleTaskComplete = toggleTaskComplete;
window.handleDeleteTask = handleDeleteTask;
window.handleDeleteAllTasks = handleDeleteAllTasks;

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
