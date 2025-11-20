const express = require("express");
const router = express.Router();
const authTodo = require("../middlewares/authTodo");
const todoController = require("../controllers/todoController");

router.post("/add", authTodo, todoController.addTodo);
router.get("/get", authTodo, todoController.getTodos);
router.put("/update/:sr_no", authTodo, todoController.updateTodo);
router.put("/status/:sr_no", authTodo, todoController.toggleTodoStatus);

router.post("/keylearning", authTodo, todoController.addKeyLearning);
router.get("/keylearning", authTodo, todoController.getKeyLearning)

router.post("/remark/:sr_no", authTodo, todoController.addRemark);

router.delete("/delete/:sr_no", authTodo, todoController.deleteTodo);

module.exports = router;