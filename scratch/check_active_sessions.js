const mongoose = require('mongoose');

const POS_MONGODB_URI = process.env.POS_MONGODB_URI;
if (!POS_MONGODB_URI) {
  console.error("Please run with: node --env-file=.env.local scratch/check_active_sessions.js");
  process.exit(1);
}

async function run() {
  try {
    const conn = await mongoose.createConnection(POS_MONGODB_URI).asPromise();
    
    const sessions = await conn.db.collection("tablesessions").find({}).toArray();
    console.log("=== Table Sessions ===");
    console.log(JSON.stringify(sessions, null, 2));

    const activeOrders = await conn.db.collection("orders").find({ orderStatus: { $ne: "COMPLETED" } }).toArray();
    console.log("\n=== Active Orders ===");
    console.log(JSON.stringify(activeOrders, null, 2));

    const kots = await conn.db.collection("kots").find({}).sort({ createdAt: -1 }).limit(10).toArray();
    console.log("\n=== Latest 10 KOTs ===");
    console.log(JSON.stringify(kots, null, 2));

    await conn.close();
  } catch (err) {
    console.error("Error inspecting database:", err);
  }
}

run();
