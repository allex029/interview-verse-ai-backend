const User = require("../models/User");
const InterviewSession = require("../models/InterviewSession");
const QuestionResult = require("../models/QuestionResult");
const mongoose = require("mongoose");

// Platform-wide stats
exports.getStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalInterviews = await InterviewSession.countDocuments();
    const avgScoreAgg = await QuestionResult.aggregate([
      { $group: { _id: null, avgScore: { $avg: "$answerScore" } } },
    ]);
    const avgScore = avgScoreAgg[0]?.avgScore || 0;
    res.json({ totalUsers, totalInterviews, averageScore: avgScore.toFixed(2) });
  } catch (err) {
    res.status(500).json({ error: "Stats failed" });
  }
};

// Debug — raw DB snapshot
exports.getDebug = async (req, res) => {
  try {
    const sessions = await InterviewSession.find({}).limit(20).lean();
    const results = await QuestionResult.find({}).limit(20).lean();
    const users = await User.find({}, "-password").lean();
    res.json({
      userCount: users.length,
      sessionCount: sessions.length,
      resultCount: results.length,
      users: users.map((u) => ({ _id: u._id, name: u.name, email: u.email })),
      sessions: sessions.map((s) => ({ _id: s._id, role: s.role, userId: s.userId, startedAt: s.startedAt })),
      results: results.map((r) => ({ _id: r._id, sessionId: r.sessionId, answerScore: r.answerScore })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Migrate orphan sessions — assign them to the only user if there's just one,
// or to the most recently created user as a best-effort fix
exports.migrateOrphanSessions = async (req, res) => {
  try {
    const { assignToUserId } = req.body;

    // Find sessions with no userId
    const orphans = await InterviewSession.find({
      $or: [{ userId: null }, { userId: { $exists: false } }],
    }).lean();

    if (orphans.length === 0) {
      return res.json({ message: "No orphan sessions found.", migrated: 0 });
    }

    let targetUserId = assignToUserId;

    // If no target specified, pick the most recently registered non-admin user
    if (!targetUserId) {
      const latestUser = await User.findOne({ isAdmin: false }).sort({ createdAt: -1 });
      if (!latestUser) return res.status(400).json({ error: "No users found to assign to" });
      targetUserId = latestUser._id;
    }

    await InterviewSession.updateMany(
      { $or: [{ userId: null }, { userId: { $exists: false } }] },
      { $set: { userId: targetUserId } }
    );

    res.json({
      message: `Migrated ${orphans.length} sessions to user ${targetUserId}`,
      migrated: orphans.length,
      assignedTo: targetUserId,
    });
  } catch (err) {
    console.error("MIGRATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// All users with their interview history
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, "-password").sort({ createdAt: -1 }).lean();

    const allSessions = await InterviewSession.find({}).sort({ startedAt: -1 }).lean();
    const allResults = await QuestionResult.find({}).lean();

    // Index results by sessionId string
    const resultsBySession = {};
    for (const r of allResults) {
      const key = r.sessionId?.toString();
      if (!key) continue;
      if (!resultsBySession[key]) resultsBySession[key] = [];
      resultsBySession[key].push(r);
    }

    // Count orphans
    const orphanSessions = allSessions.filter((s) => !s.userId);

    // Index sessions by userId string
    const sessionsByUser = {};
    for (const s of allSessions) {
      const key = s.userId?.toString();
      if (!key) continue;
      if (!sessionsByUser[key]) sessionsByUser[key] = [];
      sessionsByUser[key].push(s);
    }

    const usersWithData = users.map((user) => {
      const uid = user._id.toString();
      const sessions = sessionsByUser[uid] || [];

      const sessionSummaries = sessions.map((s) => {
        const results = resultsBySession[s._id.toString()] || [];
        const avgScore =
          results.length > 0
            ? results.reduce((sum, r) => sum + (r.answerScore || 0), 0) / results.length
            : null;
        return {
          _id: s._id,
          role: s.role,
          startedAt: s.startedAt,
          questionsCount: s.questions?.length || 0,
          answeredCount: results.length,
          avgScore: avgScore !== null ? Number(avgScore.toFixed(1)) : null,
        };
      });

      const allUserResults = sessions.flatMap((s) => resultsBySession[s._id.toString()] || []);
      const overallAvg =
        allUserResults.length > 0
          ? allUserResults.reduce((sum, r) => sum + (r.answerScore || 0), 0) / allUserResults.length
          : null;

      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
        totalInterviews: sessions.length,
        totalAnswers: allUserResults.length,
        overallAvgScore: overallAvg !== null ? Number(overallAvg.toFixed(1)) : null,
        sessions: sessionSummaries,
      };
    });

    res.json({
      users: usersWithData,
      orphanSessionCount: orphanSessions.length,
    });
  } catch (err) {
    console.error("GET USERS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// Single user detail
exports.getUserDetail = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const user = await User.findById(userId, "-password").lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const sessions = await InterviewSession.find({ userId }).sort({ startedAt: -1 }).lean();

    const sessionsWithResults = await Promise.all(
      sessions.map(async (session) => {
        const results = await QuestionResult.find({ sessionId: session._id }).lean();
        return {
          _id: session._id,
          role: session.role,
          startedAt: session.startedAt,
          questions: session.questions,
          results: results.map((r) => ({
            question: r.question,
            answerText: r.answerText,
            answerScore: r.answerScore,
            eyeContactScore: r.eyeContactScore,
            feedback: r.feedback,
            createdAt: r.createdAt,
          })),
        };
      })
    );

    res.json({ user: { ...user, sessions: sessionsWithResults } });
  } catch (err) {
    console.error("GET USER DETAIL ERROR:", err);
    res.status(500).json({ error: "Failed to fetch user detail" });
  }
};
