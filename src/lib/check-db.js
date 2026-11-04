const mongoose = require("mongoose");
const MONGODB_URI = "mongodb+srv://humtumwebsite:shubh%40123@cluster0.losgkxc.mongodb.net/?appName=Cluster0";

async function run() {
  try {
    console.log("Connecting to Mongo...");
    const conn = await mongoose.connect(MONGODB_URI);
    console.log("Connected! Default database name:", conn.connection.db.databaseName);
    
    // List databases
    const admin = conn.connection.db.admin();
    const dbs = await admin.listDatabases();
    console.log("Databases:");
    dbs.databases.forEach(db => console.log(` - ${db.name}`));
    
    // List collections in current DB
    const collections = await conn.connection.db.listCollections().toArray();
    console.log("Collections in default DB:");
    collections.forEach(c => console.log(` - ${c.name}`));
    
    // Check if there are other databases and list their collections
    for (const dbInfo of dbs.databases) {
      if (["admin", "local", "config"].includes(dbInfo.name)) continue;
      const otherDb = conn.connection.useDb(dbInfo.name);
      const otherColls = await otherDb.db.listCollections().toArray();
      console.log(`Collections in ${dbInfo.name}:`);
      otherColls.forEach(c => console.log(`   - ${c.name}`));
    }
    
    await mongoose.disconnect();
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
