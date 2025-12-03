const express = require("express");
const router = express.Router();
const authTodo = require("../middlewares/authTodo");
const todoController = require("../controllers/todoController");
const { verifyToken } = require("../middlewares/authMiddleware");

router.post("/add", verifyToken, todoController.addTodo);
router.get("/get", verifyToken, todoController.getTodos);
router.put("/update/:sr_no", verifyToken, todoController.updateTodo);
router.put("/status/:sr_no", verifyToken, todoController.toggleTodoStatus);

// router.post("/keylearning", authTodo, todoController.addKeyLearning);
// router.get("/keylearning", authTodo, todoController.getKeyLearning)

router.post("/remark/:sr_no", verifyToken, todoController.addRemark);

//router.delete("/delete/:sr_no", authTodo, todoController.deleteTodo);

module.exports = router;