import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
const POS_MONGODB_URI = process.env.POS_MONGODB_URI;
if (!MONGODB_URI || !POS_MONGODB_URI) {
  console.error("Please run with: node --env-file=.env.local scratch/test_registration.js");
  process.exit(1);
}

async function run() {
  try {
    const tableNumber = 99; // Test table
    const testName = "Test Antigravity Customer";
    const testMobile = "9876543210";

    console.log("1. Sending registration request to API...");
    const res = await fetch("http://localhost:3000/api/pos/register-customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableNumber,
        customerName: testName,
        customerMobile: testMobile
      })
    });

    const data = await res.json();
    console.log("API Response:", data);

    if (!data.success) {
      throw new Error(`API registration failed: ${data.error}`);
    }

    console.log("\n2. Connecting to CRM Database...");
    const crmConn = await mongoose.createConnection(MONGODB_URI).asPromise();
    // CRM db normally stores customers in "customers" collection
    const customer = await crmConn.db.collection("customers").findOne({ phone: "+919876543210" });
    if (customer) {
      console.log("SUCCESS: Found customer in CRM DB:", customer);
    } else {
      console.error("FAIL: Customer not found in CRM DB!");
    }

    console.log("\n3. Connecting to POS Database...");
    const posConn = await mongoose.createConnection(POS_MONGODB_URI).asPromise();
    
    const session = await posConn.db.collection("tablesessions").findOne({
      tableNo: tableNumber,
      status: { $ne: "COMPLETED" }
    });
    if (session) {
      console.log("SUCCESS: Found active table session in POS DB:", session);
    } else {
      console.error("FAIL: Active session not found in POS DB!");
    }

    let order = null;
    if (session && session.activeOrderId) {
      order = await posConn.db.collection("orders").findOne({ _id: session.activeOrderId });
      if (order) {
        console.log("SUCCESS: Found open order linked to session:", order);
      } else {
        console.error("FAIL: Linked order not found in POS DB!");
      }
    }

    // CLEANUP
    console.log("\n4. Cleaning up test data from DBs...");
    if (customer) {
      await crmConn.db.collection("customers").deleteOne({ _id: customer._id });
      console.log("Cleaned up customer from CRM DB.");
    }
    if (session) {
      await posConn.db.collection("tablesessions").deleteOne({ _id: session._id });
      console.log("Cleaned up table session from POS DB.");
    }
    if (order) {
      await posConn.db.collection("orders").deleteOne({ _id: order._id });
      console.log("Cleaned up order from POS DB.");
    }

    await crmConn.close();
    await posConn.close();
    console.log("\nVerification complete!");
  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

run();
