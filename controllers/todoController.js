const Todo = require("../models/Todo");
const User = require("../models/User");

// 📌 Auto calculate sr_no per user
async function getNextSrNo(emp_id) {
  const lastTodo = await Todo.findOne({
    where: { emp_id },
    order: [["sr_no", "DESC"]],
  });

  return lastTodo ? lastTodo.sr_no + 1 : 1;
}

exports.addTodo = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const { description, priority, date } = req.body;

    if (!description || !priority) {
      return res.status(400).json({ message: "description & priority required" });
    }

    const sr_no = await getNextSrNo(emp_id);

    const todo = await Todo.create({
      emp_id,
      sr_no,
      description,
      priority,
      date: date || new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    });

    res.status(201).json({ message: "Todo added", todo });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error", error });
  }
};

exports.getTodos = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;

    const todos = await Todo.findAll({
      where: { emp_id },
      order: [["sr_no", "ASC"]],
    });

    res.json({ todos });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

exports.updateTodo = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const { id } = req.params;
    const { description, priority, date } = req.body;

    const todo = await Todo.findOne({ where: { id, emp_id } });

    if (!todo) return res.status(404).json({ message: "Todo not found" });

    todo.description = description ?? todo.description;
    todo.priority = priority ?? todo.priority;
    todo.date = date ?? todo.date;

    await todo.save();

    res.json({ message: "Todo updated", todo });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// function diffSeconds(start, end) {
//   return Math.floor((end - start) / 1000);
// }

// function formatTime(seconds) {
//   const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
//   const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
//   const s = Math.floor(seconds % 60).toString().padStart(2, "0");
//   return `${h}:${m}:${s}`;
// }

exports.toggleTodoStatus = async (req, res) => {
  try {
    console.log("REQ BODY:", req.body);   // Debug
    console.log("REQ PARAMS:", req.params);

    const emp_id = req.user.emp_id;
    const { id } = req.params;
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({ message: "Action is required (start, pause, complete)" });
    }

    const todo = await Todo.findOne({ where: { id, emp_id } });

    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    console.log("TODO BEFORE:", todo.dataValues);

    // Convert HH:MM:SS → seconds
    const toSeconds = (t) => {
      if (!t) return 0;
      const [h, m, s] = t.split(":").map(Number);
      return h * 3600 + m * 60 + s;
    };

    // Convert seconds → HH:MM:SS
    const toHHMMSS = (sec) => {
      const h = String(Math.floor(sec / 3600)).padStart(2, "0");
      const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
      const s = String(sec % 60).padStart(2, "0");
      return `${h}:${m}:${s}`;
    };

    const now = new Date();
    const currentTime = now.toTimeString().split(" ")[0]; // HH:MM:SS

    // ------------------------------------
    // ACTION = START
    // ------------------------------------
    if (action === "start") {
      todo.status = "start";
      todo.start_time = currentTime;
    }

    // ------------------------------------
    // ACTION = PAUSE
    // ------------------------------------
    else if (action === "pause") {

      if (!todo.start_time) {
        return res.status(400).json({ message: "Cannot pause: task is not started" });
      }

      const start = new Date(`1970-01-01 ${todo.start_time}`);
      const end = new Date(`1970-01-01 ${currentTime}`);

      const diffSeconds = (end - start) / 1000;

      const previous = toSeconds(todo.total_tracked_time);
      const updated = previous + diffSeconds;

      todo.total_tracked_time = toHHMMSS(updated);
      todo.start_time = null;
      todo.status = "pause";
    }

    // ------------------------------------
    // ACTION = COMPLETE
    // ------------------------------------
    else if (action === "complete") {

      if (todo.start_time) {
        // Calculate last running time
        const start = new Date(`1970-01-01 ${todo.start_time}`);
        const end = new Date(`1970-01-01 ${currentTime}`);
        const diffSeconds = (end - start) / 1000;

        const previous = toSeconds(todo.total_tracked_time);
        const updated = previous + diffSeconds;

        todo.total_tracked_time = toHHMMSS(updated);
      }

      todo.status = "complete";
      todo.start_time = null;
    }

    else {
      return res.status(400).json({ message: "Invalid action. Use start, pause, complete" });
    }

    await todo.save();

    console.log("TODO AFTER:", todo.dataValues);

    res.json({ message: "Status updated", todo });

  } catch (error) {
    console.error("FULL ERROR:", error); // Logs full error
    res.status(500).json({ message: "Server error", error });
  }
};



exports.deleteTodo = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const { id } = req.params;

    const deleted = await Todo.destroy({ where: { id, emp_id } });

    if (!deleted) return res.status(404).json({ message: "Todo not found" });

    res.json({ message: "Todo deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};
