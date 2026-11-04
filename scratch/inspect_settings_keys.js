const fs = require('fs');
const { MongoClient } = require('mongodb');

async function inspectSettings() {
  let uri = process.env.POS_MONGODB_URI;
  if (!uri) {
    try {
      const env = fs.readFileSync('.env.local', 'utf8');
      const match = env.match(/POS_MONGODB_URI\s*=\s*(.+)/);
      if (match) {
        uri = match[1].trim().replace(/['"]/g, "");
      }
    } catch (e) {
      console.warn("Could not read .env.local", e.message);
    }
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const doc = await db.collection("settings").findOne({});
    console.log("=== All Settings Fields ===");
    console.log(doc);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

inspectSettings();
