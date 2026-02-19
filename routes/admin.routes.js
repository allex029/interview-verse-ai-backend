const router = require("express").Router();
const admin = require("../controllers/admin.controller");
const { protect, adminOnly } = require("../middleware/auth");

router.get("/stats", protect, adminOnly, admin.getStats);
router.get("/users", protect, adminOnly, admin.getAllUsers);
router.get("/users/:userId", protect, adminOnly, admin.getUserDetail);
router.get("/debug", protect, adminOnly, admin.getDebug);
router.post("/migrate-orphans", protect, adminOnly, admin.migrateOrphanSessions);

module.exports = router;
