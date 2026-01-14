import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "..", "frontend")));

// Database connection
const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// JWT Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// Routes

// User Registration
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required" });
    }

    // Check if user already exists
    const existingUser = await db.execute({
      sql: "SELECT id FROM users WHERE email = ?",
      args: [email],
    });

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = await db.execute({
      sql: "INSERT INTO users (email, password) VALUES (?, ?)",
      args: [email, hashedPassword],
    });

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// User Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required" });
    }

    // Find user
    const result = await db.execute({
      sql: "SELECT id, email, password FROM users WHERE email = ?",
      args: [email],
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: Number(user.id), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({ token, email: user.email });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all tasks for authenticated user
app.get("/tasks", authenticateToken, async (req, res) => {
  try {
    const result = await db.execute({
      sql: "SELECT * FROM tasks WHERE user_id = ? ORDER BY priority DESC, id DESC",
      args: [req.user.id],
    });

    const tasks = result.rows.map((row) => ({
      id: row.id,
      text: row.text,
      priority: row.priority,
      completed: Boolean(row.completed),
      due_date: row.due_date || null,
      created_at: row.created_at || null,
    }));

    res.json(tasks);
  } catch (error) {
    console.error("Get tasks error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new task
app.post("/tasks", authenticateToken, async (req, res) => {
  try {
    const { text, priority, due_date } = req.body;

    if (!text || !priority) {
      return res.status(400).json({ error: "Text and priority are required" });
    }

    if (!["low", "medium", "high"].includes(priority)) {
      return res
        .status(400)
        .json({ error: "Priority must be low, medium, or high" });
    }

    const result = await db.execute({
      sql: "INSERT INTO tasks (user_id, text, priority, completed, due_date) VALUES (?, ?, ?, 0, ?)",
      args: [req.user.id, text, priority, due_date || null],
    });

    // Fetch the created task to get all fields including created_at
    const createdTask = await db.execute({
      sql: "SELECT * FROM tasks WHERE id = ?",
      args: [Number(result.lastInsertRowid)],
    });

    const newTask = {
      id: Number(result.lastInsertRowid),
      text,
      priority,
      completed: false,
      due_date: createdTask.rows[0].due_date || null,
      created_at: createdTask.rows[0].created_at || null,
    };

    res.status(201).json(newTask);
  } catch (error) {
    console.error("Create task error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update a task
app.put("/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { text, priority, completed, due_date } = req.body;

    // Verify task belongs to user
    const taskCheck = await db.execute({
      sql: "SELECT user_id FROM tasks WHERE id = ?",
      args: [taskId],
    });

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (Number(taskCheck.rows[0].user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Build update query dynamically
    const updates = [];
    const args = [];

    if (text !== undefined) {
      updates.push("text = ?");
      args.push(text);
    }

    if (priority !== undefined) {
      if (!["low", "medium", "high"].includes(priority)) {
        return res
          .status(400)
          .json({ error: "Priority must be low, medium, or high" });
      }
      updates.push("priority = ?");
      args.push(priority);
    }

    if (completed !== undefined) {
      updates.push("completed = ?");
      args.push(completed ? 1 : 0);
    }

    if (due_date !== undefined) {
      updates.push("due_date = ?");
      args.push(due_date || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    args.push(taskId);

    await db.execute({
      sql: `UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });

    // Fetch updated task
    const result = await db.execute({
      sql: "SELECT * FROM tasks WHERE id = ?",
      args: [taskId],
    });

    const updatedTask = {
      id: result.rows[0].id,
      text: result.rows[0].text,
      priority: result.rows[0].priority,
      completed: Boolean(result.rows[0].completed),
      due_date: result.rows[0].due_date || null,
      created_at: result.rows[0].created_at || null,
    };

    res.json(updatedTask);
  } catch (error) {
    console.error("Update task error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a task
app.delete("/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);

    // Verify task belongs to user
    const taskCheck = await db.execute({
      sql: "SELECT user_id FROM tasks WHERE id = ?",
      args: [taskId],
    });

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (Number(taskCheck.rows[0].user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await db.execute({
      sql: "DELETE FROM tasks WHERE id = ?",
      args: [taskId],
    });

    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Delete task error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete all tasks for authenticated user
app.delete("/tasks", authenticateToken, async (req, res) => {
  try {
    await db.execute({
      sql: "DELETE FROM tasks WHERE user_id = ?",
      args: [req.user.id],
    });

    res.json({
      message: "All tasks deleted successfully",
    });
  } catch (error) {
    console.error("Delete all tasks error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
