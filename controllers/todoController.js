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
    const { title, description, priority, date } = req.body;

    if (!title || !description || !priority) {
      return res.status(400).json({ message: "title, description & priority required" });
    }

    const sr_no = await getNextSrNo(emp_id);

    const todo = await Todo.create({
      emp_id,
      sr_no,
      title,
      description,
      priority,
      status: "not_started",
      total_tracked_time: "00:00:00",
      start_time: null,
      date: date || new Date().toISOString().slice(0, 10),
      assigned_by: null,
      remark: null
    });

    // Remove key_learning from response
    const clean = todo.toJSON();
    delete clean.key_learning;

    res.status(201).json({ message: "Todo added", todo: clean });

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
      attributes: { exclude: ["key_learning"]}
    });

    res.json({ todos });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

exports.updateTodo = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const { sr_no } = req.params;
    const { title, description, priority, date, assigned_by, remark } = req.body;

    const todo = await Todo.findOne({ where: { sr_no, emp_id } });

    if (!todo) return res.status(404).json({ message: "Todo not found" });

    todo.title = title ?? todo.title;
    todo.description = description ?? todo.description;
    todo.priority = priority ?? todo.priority;
    todo.date = date ?? todo.date;
    todo.assigned_by = assigned_by ?? todo.assigned_by;
    todo.remark = remark ?? todo.remark;

    await todo.save();

    const clean = todo.toJSON();
    delete clean.key_learning;

    res.json({ message: "Todo updated", todo: clean });

  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

exports.toggleTodoStatus = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const { sr_no } = req.params;
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({ message: "Action is required (start, pause, complete)" });
    }

    const todo = await Todo.findOne({ where: { sr_no, emp_id } });

    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    // Convert HH:MM:SS → seconds
    const toSeconds = (t) => {
      if (!t) return 0;
      const [h, m, s] = t.split(":").map(Number);
      return h * 3600 + m * 60 + s;
    };

    const toHHMMSS = (sec) => {
      const h = String(Math.floor(sec / 3600)).padStart(2, "0");
      const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
      const s = String(sec % 60).padStart(2, "0");
      return `${h}:${m}:${s}`;
    };

    const now = new Date();
    const currentTime = now.toTimeString().split(" ")[0];

    // START
    if (action === "start") {
      if (!todo.start_time) {
        todo.start_time = currentTime;
      }

      todo.status = "start";
    }

    // PAUSE
    else if (action === "pause") {

      if (!todo.start_time) {
        return res.status(400).json({ message: "Cannot pause: task not started yet" });
      }

      const start = new Date(`1970-01-01 ${todo.start_time}`);
      const end = new Date(`1970-01-01 ${currentTime}`);
      const diffSeconds = (end - start) / 1000;

      const previous = toSeconds(todo.total_tracked_time);
      const updated = previous + diffSeconds;

      todo.total_tracked_time = toHHMMSS(updated);
      //todo.start_time = null;
      todo.status = "pause";
    }

    // COMPLETE
    else if (action === "complete") {

      if (!todo.start_time) {
        return res.status(400).json({ message: "Cannot complete: task not started yet" });
      }
      if (todo.start_time) {
        const start = new Date(`1970-01-01 ${todo.start_time}`);
        const end = new Date(`1970-01-01 ${currentTime}`);
        const diffSeconds = (end - start) / 1000;

        const previous = toSeconds(todo.total_tracked_time);
        const updated = previous + diffSeconds;

        todo.total_tracked_time = toHHMMSS(updated);
      }

      todo.status = "complete";
      //todo.start_time = null;
    }

    else {
      return res.status(400).json({ message: "Invalid action" });
    }

    await todo.save();

    const clean = todo.toJSON();
    delete clean.key_learning;

    res.json({ message: "Status updated", todo: clean });


  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
};


// Add Key Learning / Notes


exports.addKeyLearning = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const { notes } = req.body;
    if (!notes) return res.status(400).json({ message: "Notes required" });

    const today = new Date().toISOString().slice(0, 10);

    // Check if a todo exists for today to store key_learning
    const todo = await Todo.findOne({ where: { emp_id, date: today } });

    if (todo) {
      todo.key_learning = notes;
      await todo.save();
    } else {
      await Todo.create({ emp_id, date: today, key_learning: notes, sr_no: 1, title: "N/A", description: "N/A", priority: "Low", status: "not_started", total_tracked_time: "00:00:00" });
    }

    res.json({ message: "Key learnings saved", emp_id, date: today, key_learning: notes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
};

// Get Key Learnings
exports.getKeyLearning = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = new Date().toISOString().slice(0, 10);

    const todo = await Todo.findOne({ where: { emp_id, date: today } });

    res.json({
      emp_id,
      date: today,
      key_learning: todo?.key_learning || ""
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
};

exports.addRemark = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const { sr_no } = req.params;
    const { remark } = req.body;

    if (!remark || remark.trim() === "") {
      return res.status(400).json({ message: "Remark is required" });
    }

    const todo = await Todo.findOne({ where: { emp_id, sr_no } });

    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    // Save remark
    todo.remark = remark;
    await todo.save();

    res.json({
      message: "Remark added successfully",
      todo
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
};




exports.deleteTodo = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const { sr_no } = req.params;

    const deleted = await Todo.destroy({ where: { sr_no, emp_id } });

    if (!deleted) return res.status(404).json({ message: "Todo not found" });

    res.json({ message: "Todo deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

