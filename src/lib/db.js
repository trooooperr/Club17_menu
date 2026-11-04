import mongoose from "mongoose";

const MONGODB_URI = process.env.POS_MONGODB_URI || process.env.MONGODB_URI;

if (!MONGODB_URI && process.env.NODE_ENV === "production") {
  console.warn("[DB] Warning: POS_MONGODB_URI is not set in environment variables.");
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

let schedulerStarted = false;
function startBackgroundScheduler() {
  if (schedulerStarted) return;
  if (typeof window !== "undefined") return;
  
  schedulerStarted = true;
  console.log("[CRM Scheduler] Initializing background task loop...");
  
  // Run check every 15 minutes
  setInterval(async () => {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      console.log("[CRM Scheduler] Triggering daily automated campaigns check...");
      await fetch(`${appUrl}/api/cron/automations`, { method: "GET" });
    } catch (err) {
      console.warn("[CRM Scheduler] Background task trigger skipped:", err.message);
    }
  }, 15 * 60 * 1000);
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
    // Trigger background loop (disabled on serverless to prevent CPU usage leaks)
    // startBackgroundScheduler();
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

let posCached = global.posMongoose;

if (!posCached) {
  posCached = global.posMongoose = { conn: null, promise: null };
}

export async function posDbConnect() {
  const POS_MONGODB_URI = process.env.POS_MONGODB_URI || process.env.MONGODB_URI;
  if (!POS_MONGODB_URI) {
    throw new Error("POS_MONGODB_URI environment variable is not defined");
  }

  if (posCached.conn) {
    return posCached.conn;
  }

  if (!posCached.promise) {
    const opts = {
      bufferCommands: false,
    };

    posCached.promise = mongoose.createConnection(POS_MONGODB_URI, opts).asPromise().then((conn) => {
      return conn;
    });
  }

  try {
    posCached.conn = await posCached.promise;
    // Disable change streams & database pollers on Vercel to save CPU time
    // startInventoryWatch(posCached.conn);
  } catch (e) {
    posCached.promise = null;
    throw e;
  }

  return posCached.conn;
}

let changeStreamStarted = false;
let lastInventoriesHash = "";
let lastMenuItemsHash = "";
let persistentSocket = null;

async function getPersistentSocket() {
  if (persistentSocket && persistentSocket.connected) {
    return persistentSocket;
  }
  
  try {
    const socketUrl = process.env.NEXT_PUBLIC_POS_SOCKET_URL || (typeof window !== "undefined" ? window.location.origin : "https://humtumbar.in");
    const { io } = await import("socket.io-client");
    persistentSocket = io(socketUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000
    });
    
    return new Promise((resolve) => {
      persistentSocket.once("connect", () => {
        console.log("[Socket Broadcaster] Persistent socket connected.");
        resolve(persistentSocket);
      });
      persistentSocket.once("connect_error", () => {
        resolve(null);
      });
      // Timeout fallback
      setTimeout(() => resolve(persistentSocket), 2000);
    });
  } catch (err) {
    console.error("[Socket Broadcaster] Failed to create persistent socket:", err);
    return null;
  }
}

export async function broadcastMenuRefresh() {
  try {
    const socket = await getPersistentSocket();
    if (socket && socket.connected) {
      socket.emit("admin-broadcast", { event: "REFRESH_MENU" });
      console.log("[Socket Broadcaster] Emitted REFRESH_MENU instantly.");
    } else {
      // Fallback temp socket connection
      const socketUrl = process.env.NEXT_PUBLIC_POS_SOCKET_URL || (typeof window !== "undefined" ? window.location.origin : "https://humtumbar.in");
      const { io } = await import("socket.io-client");
      const tempSocket = io(socketUrl, {
        transports: ["websocket"],
        reconnection: false,
        timeout: 1000
      });
    }
  } catch (err) {
    console.error("Failed to broadcast REFRESH_MENU:", err.message);
  }
}

async function broadcastTableReset(tableNum) {
  try {
    const socket = await getPersistentSocket();
    if (socket && socket.connected) {
      socket.emit("admin-broadcast", {
        event: "ORDER_COMPLETED",
        tableNumber: tableNum
      });
      console.log(`[Socket Broadcaster] Emitted ORDER_COMPLETED for Table ${tableNum} instantly.`);
    } else {
      const socketUrl = process.env.NEXT_PUBLIC_POS_SOCKET_URL || (typeof window !== "undefined" ? window.location.origin : "https://humtumbar.in");
      const { io } = await import("socket.io-client");
      const tempSocket = io(socketUrl, {
        transports: ["websocket"],
        reconnection: false,
        timeout: 1000
      });
      tempSocket.on("connect", () => {
        tempSocket.emit("admin-broadcast", {
          event: "ORDER_COMPLETED",
          tableNumber: tableNum
        });
        setTimeout(() => tempSocket.disconnect(), 100);
      });
    }
  } catch (err) {
    console.error("Failed to broadcast ORDER_COMPLETED:", err.message);
  }
}

function startInventoryWatch(conn) {
  if (changeStreamStarted) return;
  if (process.env.ENABLE_CHANGE_STREAMS !== "true") {
    console.log("[Inventory Watcher] Change Streams & Background polling disabled to minimize database network traffic.");
    return;
  }
  changeStreamStarted = true;

  console.log("[Inventory Watcher] Initializing Change Streams for POS collections...");
  
  // Watch inventories collection
  try {
    const inventories = conn.db.collection("inventories");
    const invStream = inventories.watch();
    invStream.on("change", async (change) => {
      console.log("[Inventory Watcher] Detected inventory change in DB:", change.operationType);
      await broadcastMenuRefresh();
    });
    invStream.on("error", (error) => {
      console.error("[Inventory Watcher] Inventory change stream encountered error:", error.message || error);
      changeStreamStarted = false;
    });
  } catch (err) {
    console.error("[Inventory Watcher] Failed to start inventories stream:", err.message || err);
  }

  // Watch menuitems collection
  try {
    const menuitems = conn.db.collection("menuitems");
    const menuStream = menuitems.watch();
    menuStream.on("change", async (change) => {
      console.log("[Inventory Watcher] Detected menuitems change in DB:", change.operationType);
      await broadcastMenuRefresh();
    });
    menuStream.on("error", (error) => {
      console.error("[Inventory Watcher] Menuitems change stream encountered error:", error.message || error);
      changeStreamStarted = false;
    });
  } catch (err) {
    console.error("[Inventory Watcher] Failed to start menuitems stream:", err.message || err);
  }

  // Watch orders collection
  try {
    const orders = conn.db.collection("orders");
    const ordersStream = orders.watch();
    ordersStream.on("change", async (change) => {
      if (change.operationType === "insert" || change.operationType === "update" || change.operationType === "replace") {
        const orderId = change.documentKey._id;
        const order = await conn.db.collection("orders").findOne({ _id: orderId });
        if (order) {
          const hasClearItem = (order.items || []).some(
            item => (item.name || "").toLowerCase().trim() === "clear" || (item.name || "").toLowerCase().trim() === "clear table"
          );
          if (hasClearItem) {
            console.log(`[Order Watcher] Clear item detected for order ${orderId} (Table ${order.tableNo}). Restoring inventory and clearing table session...`);
            
            // 1. Restore any deducted inventory stock from previously printed KOTs for this order
            try {
              const orderKots = await conn.db.collection("kots").find({ orderId: order._id }).toArray();
              for (const kot of orderKots) {
                if (kot.inventoryDeducted && kot.items) {
                  for (const item of kot.items) {
                    if (item.department === "bar") {
                      const itemNameLower = (item.name || "").toLowerCase().trim();
                      await conn.db.collection("inventories").updateOne(
                        { name: { $regex: new RegExp(`^${itemNameLower}$`, "i") } },
                        { $inc: { stock: item.quantity } } // Restore stock by adding it back
                      );
                    }
                  }
                }
              }
            } catch (invErr) {
              console.error("Failed to restore inventory on table clear via watch:", invErr.message);
            }

            // 2. Delete order completely from the orders collection (this removes it from history/analytics/reports)
            await conn.db.collection("orders").deleteOne({ _id: order._id });

            // 3. Delete any associated KOTs from the kots collection
            await conn.db.collection("kots").deleteMany({ orderId: order._id });

            // 4. Reset Table Session in POS database (delete it to free the table)
            await conn.db.collection("tablesessions").deleteOne({ tableNo: order.tableNo });

            // 5. Broadcast ORDER_COMPLETED to clear cart/history instantly on client UI
            await broadcastTableReset(order.tableNo);
          }
        }
      }
    });
    ordersStream.on("error", (error) => {
      console.error("[Order Watcher] Orders change stream encountered error:", error.message || error);
      changeStreamStarted = false;
    });
  } catch (err) {
    console.error("[Order Watcher] Failed to start orders stream:", err.message || err);
  }
}


// ── SCHEMAS & MODELS ──

const ReservationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  guests: { type: Number, required: true },
  date: { type: String, required: true },
  time: { type: String },
  occasion: { type: String },
  message: { type: String },
  diningArea: { type: String, default: "Main Room" },
  status: { type: String, enum: ["pending", "confirmed", "rejected"], default: "pending" },
  notifiedCallRest: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const ContactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String },
  email: { type: String },
  subject: { type: String },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const SubscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});

// Avoid model recompilation errors during Next.js hot-reloads
export const Reservation = mongoose.models.Reservation || mongoose.model("Reservation", ReservationSchema);
export const Contact = mongoose.models.Contact || mongoose.model("Contact", ContactSchema);
export const Subscriber = mongoose.models.Subscriber || mongoose.model("Subscriber", SubscriberSchema);

const AdminSettingsSchema = new mongoose.Schema({
  email: { type: String, required: true, default: "shubhampriy11@gmail.com" },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const AdminOTPSchema = new mongoose.Schema({
  email: { type: String, required: true, default: "shubhampriy11@gmail.com" },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export const AdminSettings = mongoose.models.AdminSettings || mongoose.model("AdminSettings", AdminSettingsSchema);
export const AdminOTP = mongoose.models.AdminOTP || mongoose.model("AdminOTP", AdminOTPSchema);

const EventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  desc: { type: String, required: true },
  date: { type: String, required: true },
  category: { type: String, required: true },
  type: { type: String, enum: ["i", "v"], default: "i" },
  thumb: { type: String, required: true },
  full: { type: String, required: true },
  alt: { type: String, default: "" },
  isUpcoming: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export const Event = mongoose.models.Event || mongoose.model("Event", EventSchema);

const MenuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  desc: { type: String, required: true },
  price: { type: String, default: "" },
  tag: { type: String, default: "" },
  badge: { type: String, default: "" },
  category: { type: String, enum: ["starters", "mains", "main_course", "desserts", "bar_bites", "drinks"], required: true },
  createdAt: { type: Date, default: Date.now }
});

export const MenuItem = mongoose.models.MenuItem || mongoose.model("MenuItem", MenuItemSchema);

// Check-In Staff Users
const CheckInUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  passwordHash: { type: String, required: true },
  status: { type: String, enum: ["active", "disabled"], default: "active" },
  createdAt: { type: Date, default: Date.now }
});

export const CheckInUser = mongoose.models.CheckInUser || mongoose.model("CheckInUser", CheckInUserSchema);

// Check-In Staff Login Activity
const CheckInLoginActivitySchema = new mongoose.Schema({
  checkInUserId: { type: mongoose.Schema.Types.ObjectId, ref: "CheckInUser" },
  username: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String },
  status: { type: String, enum: ["success", "failed"] },
  timestamp: { type: Date, default: Date.now }
});

export const CheckInLoginActivity = mongoose.models.CheckInLoginActivity || mongoose.model("CheckInLoginActivity", CheckInLoginActivitySchema);

// Check-In Staff OTP for forgot password reset
const CheckInOTPSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export const CheckInOTP = mongoose.models.CheckInOTP || mongoose.model("CheckInOTP", CheckInOTPSchema);

// Customer Unified Profile
const CustomerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, index: true },
  email: { type: String, index: true },
  aadhaarNumber: { type: String, index: true },
  dob: { type: String }, // Format: YYYY-MM-DD or MM-DD
  anniversary: { type: String }, // Format: YYYY-MM-DD or MM-DD
  gender: { type: String },
  address: { type: String },
  visitsCount: { type: Number, default: 0 },
  lastVisitDate: { type: Date },
  sources: { type: [String], default: [] }, // e.g. ["check-in", "reservation", "contact", "newsletter"]
  createdAt: { type: Date, default: Date.now }
});

export const Customer = mongoose.models.Customer || mongoose.model("Customer", CustomerSchema);

// Customer Visit Record
const VisitSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
  checkInUserId: { type: mongoose.Schema.Types.ObjectId, ref: "CheckInUser" },
  notes: { type: String },
  additionalGuests: { type: Number, default: 0 },
  archived: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

export const Visit = mongoose.models.Visit || mongoose.model("Visit", VisitSchema);

const DailyCheckInReportSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // "YYYY-MM-DD"
  totalCheckIns: { type: Number, required: true },
  visitors: [{
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    name: { type: String },
    phone: { type: String },
    email: { type: String },
    visitTime: { type: Date }
  }],
  createdAt: { type: Date, default: Date.now }
});

export const DailyCheckInReport = mongoose.models.DailyCheckInReport || mongoose.model("DailyCheckInReport", DailyCheckInReportSchema);

const DailyResetLogSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // "YYYY-MM-DD"
  executedAt: { type: Date, default: Date.now }
});

export const DailyResetLog = mongoose.models.DailyResetLog || mongoose.model("DailyResetLog", DailyResetLogSchema);

const DailyAutomationLogSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // "YYYY-MM-DD"
  executedAt: { type: Date, default: Date.now }
});

export const DailyAutomationLog = mongoose.models.DailyAutomationLog || mongoose.model("DailyAutomationLog", DailyAutomationLogSchema);

// Marketing Campaign
const CampaignSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: { type: String, required: true },
  content: { type: String, required: true }, // Rich HTML
  imageUrl: { type: String, default: "" },
  channels: { type: [String], default: ["email"] }, // "email", "whatsapp"
  audience: { type: String, enum: ["all", "newsletter", "reservation", "walk-in", "custom"], default: "all" },
  customSelection: { type: [mongoose.Schema.Types.ObjectId], ref: "Customer", default: [] },
  campaignType: { type: String, required: true }, // DJ Night, live_music, festival, happy_hours, etc.
  status: { type: String, enum: ["draft", "scheduled", "sent"], default: "draft" },
  scheduledAt: { type: Date },
  sentAt: { type: Date },
  analytics: {
    emailsSent: { type: Number, default: 0 },
    emailsOpened: { type: Number, default: 0 },
    emailClickRate: { type: Number, default: 0 },
    whatsappSent: { type: Number, default: 0 },
    whatsappDelivered: { type: Number, default: 0 },
    whatsappRead: { type: Number, default: 0 }
  },
  rangeStart: { type: Number, default: 0 },
  rangeLimit: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

export const Campaign = mongoose.models.Campaign || mongoose.model("Campaign", CampaignSchema);

// Communication Logs for each message dispatched to customer
const CommunicationLogSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" },
  type: { type: String, enum: ["welcome", "marketing", "birthday", "anniversary", "event"] },
  channel: { type: String, enum: ["email", "whatsapp"] },
  recipient: { type: String },
  subject: { type: String },
  message: { type: String },
  status: { type: String, enum: ["sent", "delivered", "opened", "failed"], default: "sent" },
  whatsappMessageId: { type: String },
  error: { type: String },
  sentAt: { type: Date, default: Date.now }
});

export const CommunicationLog = mongoose.models.CommunicationLog || mongoose.model("CommunicationLog", CommunicationLogSchema);

// CRM Settings Model
const CRMSettingsSchema = new mongoose.Schema({
  whatsappNumber: { type: String, default: "" },
  whatsappApiUrl: { type: String, default: "https://graph.facebook.com/v19.0" },
  whatsappToken: { type: String, default: "" },
  reservationLink: { type: String, default: "https://humtumbar.in/#reserve" },
  instagramLink: { type: String, default: "https://instagram.com/humtum.thebar" },
  googleReviewLink: { type: String, default: "https://g.page/r/humtum-thebar/review" },
  foodMenuBase64: { type: String, default: "" },
  barMenuBase64: { type: String, default: "" },
  
  // Welcome templates
  welcomeEmailTemplate: { type: String, default: "<h3>Welcome to HUMTUM!</h3><p>Dear {{name}}, thank you for checking in today. We hope you have a premium experience!</p><p>For your convenience, here are our menus: <a href=\"{{food_menu_link}}\">Food Menu</a> and <a href=\"{{bar_menu_link}}\">Bar Menu</a>.</p>" },
  welcomeWhatsappTemplate: { type: String, default: "Hello {{name}}, welcome to HUMTUM! Here are our menus: {{food_menu_link}} and {{bar_menu_link}}. Enjoy your visit!" },
  
  // Birthday Automation Settings
  birthdayEnabled: { type: Boolean, default: true },
  birthdayDiscount: { type: Number, default: 15 },
  birthdayEmailTemplate: { type: String, default: "<h3>Happy Birthday {{name}}!</h3><p>Celebrate your special day at HUMTUM. Enjoy {{discount}}% off on your bill! Just bring your Aadhaar card for age verification. Offer is valid on your birthday only.</p>" },
  birthdayWhatsappTemplate: { type: String, default: "Happy Birthday {{name}}! 🎉 Celebrate with us at HUMTUM and get {{discount}}% off on your bill. Just bring your Aadhaar card for age verification. Offer is valid on your birthday only! Book table: {{reserve_link}}" },
  
  // Anniversary Automation Settings
  anniversaryEnabled: { type: Boolean, default: true },
  anniversaryDiscount: { type: Number, default: 20 },
  anniversaryEmailTemplate: { type: String, default: "<h3>Happy Anniversary {{name}}!</h3><p>Celebrate your milestone at HUMTUM. Enjoy {{discount}}% off on your bill! Just bring your Aadhaar card / marriage certificate for verification. Offer is valid on your anniversary day only.</p>" },
  anniversaryWhatsappTemplate: { type: String, default: "Happy Anniversary {{name}}! 🥂 Celebrate your special day with us at HUMTUM and get {{discount}}% off on your bill. Just bring your Aadhaar card / marriage certificate for verification. Offer is valid on your anniversary day only!" }
});

export const CRMSettings = mongoose.models.CRMSettings || mongoose.model("CRMSettings", CRMSettingsSchema);

// Live POS Tables Status & Real-time Cart Sync
const POSTableSchema = new mongoose.Schema({
  tableNumber: { type: Number, required: true, unique: true },
  status: { type: String, enum: ["idle", "busy"], default: "idle" },
  customerName: { type: String, default: "" },
  customerMobile: { type: String, default: "" },
  waiterName: { type: String, default: "" },
  activeCart: [{
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" },
    name: { type: String },
    price: { type: Number },
    quantity: { type: Number },
    category: { type: String }
  }],
  updatedAt: { type: Date, default: Date.now }
});

export const POSTable = mongoose.models.POSTable || mongoose.model("POSTable", POSTableSchema);

// Placed KOT Orders & Transaction History
const POSOrderSchema = new mongoose.Schema({
  tableNumber: { type: Number, required: true },
  customerName: { type: String, default: "" },
  customerMobile: { type: String, default: "" },
  waiterName: { type: String, default: "" },
  items: [{
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" },
    name: { type: String },
    price: { type: Number },
    quantity: { type: Number },
    category: { type: String },
    status: { type: String, enum: ["placed", "preparing", "served"], default: "placed" },
    kotPrinted: { type: Boolean, default: false }
  }],
  status: { type: String, enum: ["active", "billed"], default: "active" },
  totalAmount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

export const POSOrder = mongoose.models.POSOrder || mongoose.model("POSOrder", POSOrderSchema);



export default dbConnect;

