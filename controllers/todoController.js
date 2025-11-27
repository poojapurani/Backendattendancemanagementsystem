const Todo = require("../models/Todo");
const User = require("../models/User");
const Attendance = require("../models/Attendance");
const IdentityCard = require("../models/IdentityCard");


// Check if user punched in today
async function isUserPunchedIn(emp_id) {
  const today = new Date().toISOString().split("T")[0];

  const attendance = await Attendance.findOne({
    where: { emp_id, date: today }
  });

  return attendance?.time_in ? true : false;
}

// Check if user is punched out today
async function isUserPunchedOut(emp_id) {
  const today = new Date().toISOString().split("T")[0];

  const attendance = await Attendance.findOne({
    where: { emp_id, date: today }
  });

  return attendance?.time_out ? true : false;
}

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
    const userId = req.user.id; // from JWT

    // Use correct column name 'user_id'
    const identity = await IdentityCard.findOne({ where: { user_id: userId } });
    if (!identity) return res.status(404).json({ message: "Identity card not found" });
    const emp_id = identity.emp_id;

    const { title, description, priority, date } = req.body;

    if (!(await isUserPunchedIn(emp_id))) {
      return res.status(403).json({
        message: "You must punch in before adding todos."
      });
    }

    if (await isUserPunchedOut(emp_id)) {
      return res.status(403).json({
        message: "You are already punched out. Cannot add new todos."
      });
    }

    const today = getISTDateString();
    const attendance = await Attendance.findOne({ where: { emp_id, date: today } });
    if (attendance?.work_end) {
      return res.status(403).json({
        message: "Work has ended for today. Cannot modify tasks."
      });
    }

    if (!title || !priority) {
      return res.status(400).json({ message: "title & priority required" });
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
    const userId = req.user.id; // from JWT

    // Get emp_id from IdentityCard
    const identity = await IdentityCard.findOne({ where: { user_id: userId } });
    if (!identity) return res.status(404).json({ message: "Identity card not found" });
    const emp_id = identity.emp_id;

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // FIXED: Query by correct DB column 'id'
    const user = await User.findOne({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const fetchIds = [user.emp_id, ...(user.previous_emp_ids || [])];

    const todos = await Todo.findAll({
      where: { emp_id: fetchIds },
      order: [["sr_no", "ASC"]],
      attributes: { exclude: ["key_learning"] }
    });

    const filtered = todos.filter(todo => {
      const todoDate = todo.date; // already YYYY-MM-DD because DATEONLY

      // Show all if today
      if (todoDate === today) return true;

      // Previous dates → hide completed
      return todo.status !== "complete";
    });

    res.json({ todos: filtered });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};


exports.updateTodo = async (req, res) => {
  try {
    const userId = req.user.id; // from JWT
    const identity = await IdentityCard.findOne({ where: { user_id: userId } });
    if (!identity) return res.status(404).json({ message: "Identity card not found" });
    const emp_id = identity.emp_id;

    const { sr_no } = req.params;
    const { title, description, priority, date, assigned_by, remark } = req.body;

    const todo = await Todo.findOne({ where: { sr_no, emp_id } });

    if (!(await isUserPunchedIn(emp_id))) {
      return res.status(403).json({
        message: "You must punch in before updating todos."
      });
    }
    if (await isUserPunchedOut(emp_id)) {
      return res.status(403).json({
        message: "You are already punched out. Cannot update todo."
      });
    }

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

const safeDate = (time) => {
  if (!time || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return null;
  return new Date(`1970-01-01T${time}Z`);
};

function getISTDate() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}


function getISTDateString() {
  const d = getISTDate();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getISTTimeString() {
  const d = getISTDate();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

exports.toggleTodoStatus = async (req, res) => {
  try {
    const userId = req.user.id; // from JWT
    const identity = await IdentityCard.findOne({ where: { user_id: userId } });
    if (!identity) return res.status(404).json({ message: "Identity card not found" });
    const emp_id = identity.emp_id;

    const { sr_no } = req.params;
    const { action } = req.body;

    if (!(await isUserPunchedIn(emp_id))) {
      return res.status(403).json({
        message: "You must punch in before starting/pausing/completing tasks."
      });
    }
    // ❗ BLOCK if punched out
    if (await isUserPunchedOut(emp_id)) {
      return res.status(403).json({
        message: "You are already punched out. Cannot start/pause/complete tasks."
      });
    }

    const today = getISTDateString();
    const attendance = await Attendance.findOne({ where: { emp_id, date: today } });
    if (attendance?.work_end) {
      return res.status(403).json({
        message: "Work has ended for today. Cannot modify tasks."
      });
    }
    
    if (!action) {
      return res.status(400).json({ message: "Action is required (start, pause, complete)" });
    }

    const todo = await Todo.findOne({ where: { sr_no, emp_id } });

    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    // Convert HH:MM:SS → seconds
    const toSeconds = (t) => {
      if (!t || t === "NaN:NaN:NaN") return 0;
      if (!/^\d{2}:\d{2}:\d{2}$/.test(t)) return 0; // FIX
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

    // START (includes resume)
    if (action === "start") {

        if (!todo.total_tracked_time) {
          todo.total_tracked_time = "00:00:00";
        }


        // FIRST START CASE
        if (!todo.start_time && todo.status !== "pause") {
            todo.start_time = currentTime;
            todo.status = "start";
        }

        // RESUME CASE (status = pause)
        else if (todo.status === "pause") {

            // Reset start_time to NOW (IMPORTANT)
            todo.start_time = currentTime;

            todo.status = "start";
        }

        else if (todo.status === "complete") {
        const { remark } = req.body;

        if (!remark || remark.trim() === "") {
            return res.status(400).json({ message: "Remark is required to restart a completed task" });
        }

        // Save remark (append to key_learning or overwrite as per your logic)
        todo.key_learning = remark;

        todo.start_time = currentTime; // reset start_time
        todo.status = "start";
        // total_tracked_time is kept as-is
    }

        await todo.save();
        return res.json({ message: "Task started/resumed", todo });
    }



    // PAUSE
    else if (action === "pause") {

        if (!todo.start_time) {
            return res.status(400).json({ message: "Cannot pause: task not started yet" });
        }

        const start = safeDate(todo.start_time);
        if (!start) return res.status(400).json({ message: "Invalid start_time for task" });

        const end = safeDate(currentTime);

        const diffSeconds = (end - start) / 1000;

        const previous = toSeconds(todo.total_tracked_time);
        const updated = previous + diffSeconds;

        todo.total_tracked_time = toHHMMSS(updated);

        // DO NOT RESET start_time (as per your requirement)
        // todo.start_time = null;

        todo.status = "pause";

        await todo.save();
        return res.json({ message: "Task paused", todo });
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

    // RESET
    else if (action === "reset") {

        // Reset all tracking
        todo.start_time = null;
        todo.total_tracked_time = "00:00:00";
        todo.status = "not_started"; // or whatever default you use
        todo.key_learning = null; // optional: clear any notes if needed

        await todo.save();
        return res.json({ message: "Task has been reset to start over", todo });
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

// exports.addKeyLearning = async (req, res) => {
//   try {
//     const { notes } = req.body;

//     if (!notes) {
//       return res.status(400).json({ message: "Notes required" });
//     }

//     res.json({
//       message: "Key learning received. Punch-out will save it.",
//       notes
//     });

//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Server error", error });
//   }
// };


// // Get Key Learnings
// exports.getKeyLearning = async (req, res) => {
//   try {
//     const emp_id = req.user.emp_id;
//     const today = new Date().toISOString().slice(0, 10);

//     const todo = await Todo.findOne({ where: { emp_id, date: today } });

//     res.json({
//       emp_id,
//       date: today,
//       key_learning: todo?.key_learning || ""
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Server error", error });
//   }
// };

exports.addRemark = async (req, res) => {
  try {
    const userId = req.user.id; // from JWT
    const identity = await IdentityCard.findOne({ where: { user_id: userId } });
    if (!identity) return res.status(404).json({ message: "Identity card not found" });
    const emp_id = identity.emp_id;

    const { sr_no } = req.params;
    const { remark } = req.body;

    if (!(await isUserPunchedIn(emp_id))) {
      return res.status(403).json({
        message: "You must punch in before adding remarks."
      });
    }
    if (await isUserPunchedOut(emp_id)) {
      return res.status(403).json({
        message: "You are already punched out. Cannot add remark."
      });
    }

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




// exports.deleteTodo = async (req, res) => {
//   try {
//     const userId = req.user.id; // from JWT
//     const identity = await IdentityCard.findOne({ where: { userId } });
//     if (!identity) return res.status(404).json({ message: "Identity card not found" });
//     const emp_id = identity.emp_id;

//     const { sr_no } = req.params;

//     if (!(await isUserPunchedIn(emp_id))) {
//       return res.status(403).json({
//         message: "You must punch in before deleting todos."
//       });
//     }

//     if (await isUserPunchedOut(emp_id)) {
//       return res.status(403).json({
//         message: "You are already punched out. Cannot delete todos."
//       });
//     }


//     const deleted = await Todo.destroy({ where: { sr_no, emp_id } });

//     if (!deleted) return res.status(404).json({ message: "Todo not found" });

//     res.json({ message: "Todo deleted" });
//   } catch (error) {
//     res.status(500).json({ message: "Server error", error });
//   }
// };

