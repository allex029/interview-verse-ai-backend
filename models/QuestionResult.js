const mongoose = require("mongoose");

const QuestionResultSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InterviewSession",
  },
  question: String,
  answerText: String,
  answerScore: Number,
  eyeContactScore: Number,
  feedback: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model(
  "QuestionResult",
  QuestionResultSchema
);
