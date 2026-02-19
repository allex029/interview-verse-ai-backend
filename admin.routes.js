const mongoose = require("mongoose");

const InterviewSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false, // allow guest for now (faster MVP)
  },
  role: String,
  questions: [String],
  startedAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: Date,
  overallScore: Number,
});

module.exports = mongoose.model(
  "InterviewSession",
  InterviewSessionSchema
);
