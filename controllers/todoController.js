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

exports.toggleTodoStatus = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const { id } = req.params;

    const todo = await Todo.findOne({ where: { id, emp_id } });

    if (!todo) return res.status(404).json({ message: "Todo not found" });

    todo.status = todo.status === "pending" ? "completed" : "pending";

    await todo.save();

    res.json({ message: "Status toggled", todo });
  } catch (error) {
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
