const express = require("express");
const router = express.Router();
const authTodo = require("../middlewares/authTodo");
const todoController = require("../controllers/todoController");

router.post("/add", authTodo, todoController.addTodo);
router.get("/get", authTodo, todoController.getTodos);
router.put("/update/:id", authTodo, todoController.updateTodo);
router.put("/status/:id", authTodo, todoController.toggleTodoStatus);
router.delete("/delete/:id", authTodo, todoController.deleteTodo);

module.exports = router;
