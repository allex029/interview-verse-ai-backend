require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();

connectDB();

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://interview-verse-ai-frontend.vercel.app/"  // add your actual Vercel URL
  ],
  credentials: true,
}));
app.use(express.json());

app.use("/api/interview", require("./routes/interview.routes"));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/admin", require("./routes/admin.routes"));

app.listen(5001, () =>
  console.log("🚀 Backend running on 5001")
);

