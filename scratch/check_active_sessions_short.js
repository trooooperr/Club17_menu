const mongoose = require('mongoose');
const POS_MONGODB_URI = process.env.POS_MONGODB_URI;
if (!POS_MONGODB_URI) {
  console.error("Please run with: node --env-file=.env.local scratch/check_active_sessions_short.js");
  process.exit(1);
}

async function run() {
  try {
    const conn = await mongoose.createConnection(POS_MONGODB_URI).asPromise();
    
    const sessions = await conn.db.collection("tablesessions").find({}).toArray();
    console.log("=== Active Table Sessions ===");
    sessions.forEach(s => {
      console.log(`Table ${s.tableNo}: ID=${s._id}, activeOrderId=${s.activeOrderId}, status=${s.status}, itemsCount=${s.pendingItems?.length || 0}`);
    });

    const activeOrders = await conn.db.collection("orders").find({ orderStatus: { $ne: "COMPLETED" } }).toArray();
    console.log("\n=== Active Orders ===");
    activeOrders.forEach(o => {
      console.log(`Order ${o.billNo} (Table ${o.tableNo}): ID=${o._id}, status=${o.orderStatus}, items=${(o.items || []).map(i => i.name).join(', ')}`);
    });

    await conn.close();
  } catch (err) {
    console.error("Error inspecting database:", err);
  }
}

run();
