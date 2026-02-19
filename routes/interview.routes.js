const express = require("express");
const router = express.Router();
const controller = require("../controllers/interview.controller");
const { protect } = require("../middleware/auth");

router.post("/start", protect, controller.startInterview);
router.post("/evaluate", protect, controller.evaluateAnswer);
router.get("/report/:sessionId", protect, controller.getInterviewReport);

module.exports = router;