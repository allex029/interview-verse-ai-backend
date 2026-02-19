const axios = require("axios");
const InterviewSession = require("../models/InterviewSession");
const QuestionResult = require("../models/QuestionResult");

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// 🎯 Start interview
exports.startInterview = async (req, res) => {
  try {
    const { role: jobRole } = req.body;

    if (!jobRole) {
      return res.status(400).json({ error: "Role is required" });
    }

    const response = await axios.post(
      GROQ_URL,
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You are an expert technical interviewer. Generate exactly 10 concise, role-specific technical interview questions. Return ONLY a valid JSON array of strings, no extra text.",
          },
          {
            role: "user",
            content: `Generate 10 technical interview questions for the role: ${jobRole}`,
          },
        ],
        response_format: { type: "json_object" },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const raw = response.data.choices[0].message.content;
    
    // Try to extract array from various response formats
    let questions = [];
    try {
      const parsed = JSON.parse(raw);
      // Handle { questions: [...] } or { "1": "...", ... } or direct array
      if (Array.isArray(parsed)) {
        questions = parsed;
      } else if (parsed.questions && Array.isArray(parsed.questions)) {
        questions = parsed.questions;
      } else {
        questions = Object.values(parsed).filter(v => typeof v === "string");
      }
    } catch {
      // Fallback: regex extract array
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        questions = parsed.map((q) => (typeof q === "string" ? q : q.question));
      } else {
        throw new Error("Could not parse questions from AI response");
      }
    }

    questions = questions.slice(0, 10).filter(Boolean);

    const session = await InterviewSession.create({
      role: jobRole,
      questions,
      userId: req.user?.id || null,
    });

    res.json({ sessionId: session._id, questions });
  } catch (err) {
    console.error("START ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
};

// 🎯 Evaluate answer
exports.evaluateAnswer = async (req, res) => {
  try {
    const { sessionId, question, answerText, eyeContactScore } = req.body;

    if (!answerText || !answerText.trim()) {
      return res.status(400).json({ error: "Answer text is required" });
    }

    const response = await axios.post(
      GROQ_URL,
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are a strict but fair technical interviewer. Evaluate the candidate's answer concisely.

Format your response exactly as:
Score: X/10
Feedback: [2-3 sentences of constructive feedback on technical accuracy, clarity, and completeness]`,
          },
          {
            role: "user",
            content: `Question: ${question}\nAnswer: ${answerText}`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const feedback = response.data.choices[0].message.content;
    const scoreMatch = feedback.match(/(\d+)\s*\/\s*10/);
    const score = scoreMatch ? Number(scoreMatch[1]) : 5;

    await QuestionResult.create({
      sessionId, question, answerText,
      answerScore: score, eyeContactScore, feedback,
    });

    res.json({ score, feedback });
  } catch (err) {
    console.error("EVALUATE ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: "Evaluation failed" });
  }
};

// 🎯 Interview report
exports.getInterviewReport = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const results = await QuestionResult.find({ sessionId });

    if (!results.length) {
      return res.status(404).json({ error: "No results found for this session" });
    }

    const totalQuestions = results.length;
    const avgAnswerScore = results.reduce((sum, r) => sum + (r.answerScore || 0), 0) / totalQuestions;
    const avgEyeScore = results.reduce((sum, r) => sum + (r.eyeContactScore || 0), 0) / totalQuestions;

    const strengths = [];
    const improvements = [];

    if (avgAnswerScore >= 7) strengths.push("Strong technical knowledge demonstrated across questions");
    if (avgAnswerScore >= 5) strengths.push("Decent understanding of core concepts");
    if (avgEyeScore >= 70) strengths.push("Good eye contact and confident presence");
    if (avgEyeScore >= 80) strengths.push("Excellent non-verbal communication");

    if (avgAnswerScore < 7) improvements.push("Deepen technical knowledge with hands-on practice projects");
    if (avgAnswerScore < 5) improvements.push("Study fundamentals more thoroughly before the next round");
    if (avgEyeScore < 70) improvements.push("Practice maintaining eye contact — it signals confidence");
    if (totalQuestions < 10) improvements.push("Complete all questions for a full assessment next time");

    res.json({
      totalQuestions,
      avgAnswerScore: Number(avgAnswerScore.toFixed(1)),
      avgEyeScore: Number(avgEyeScore.toFixed(1)),
      strengths,
      improvements,
    });
  } catch (err) {
    console.error("REPORT ERROR:", err);
    res.status(500).json({ error: "Report generation failed" });
  }
};
