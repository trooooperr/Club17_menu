// Run this script to clean up stale tablesessions that are causing "busy" display
// Usage: node cleanup-stale-sessions.js

require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

async function cleanupStaleSessions() {
  const uri = process.env.POS_MONGODB_URI;
  if (!uri) {
    console.error('POS_MONGODB_URI not found in .env.local');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('Connected to POS MongoDB...');
    
    const db = client.db();
    
    // Find all sessions that are NOT completed
    const allSessions = await db.collection('tablesessions').find({
      status: { $ne: 'COMPLETED' }
    }).toArray();

    console.log(`\nFound ${allSessions.length} active/stale sessions:\n`);
    
    for (const session of allSessions) {
      // Check if the linked order is actually COMPLETED or doesn't exist
      let isStale = false;
      let reason = '';
      
      if (!session.activeOrderId) {
        isStale = true;
        reason = 'No activeOrderId';
      } else {
        const { ObjectId } = require('mongodb');
        const order = await db.collection('orders').findOne({
          _id: new ObjectId(session.activeOrderId)
        });
        
        if (!order) {
          isStale = true;
          reason = 'Order document not found';
        } else if (order.orderStatus === 'COMPLETED') {
          isStale = true;
          reason = `Order is COMPLETED (${order.orderStatus})`;
        }
      }
      
      console.log(`Table ${session.tableNo}: status=${session.status}, stale=${isStale}${reason ? ` (${reason})` : ''}`);
      
      if (isStale) {
        await db.collection('tablesessions').deleteOne({ _id: session._id });
        console.log(`  ✅ Deleted stale session for Table ${session.tableNo}`);
      }
    }
    
    console.log('\n✅ Cleanup complete! Refreshing table status will now show correct idle state.');
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

cleanupStaleSessions();
