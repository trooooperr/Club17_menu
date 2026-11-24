import { NextResponse } from "next/server";
import dbConnect, { posDbConnect } from "@/lib/db";
import { ObjectId } from "mongodb";
import { syncCustomerFromSource } from "@/lib/crm";

function getISTBusinessDateStr(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const dateParts = {};
  parts.forEach(p => dateParts[p.type] = parseInt(p.value, 10));

  let year = dateParts.year;
  let month = dateParts.month - 1; // 0-indexed
  let day = dateParts.day;
  let hour = dateParts.hour;

  // If before 5 AM IST, the business day started yesterday
  if (hour < 5) {
    const tempDate = new Date(Date.UTC(year, month, day));
    tempDate.setUTCDate(tempDate.getUTCDate() - 1);
    year = tempDate.getUTCFullYear();
    month = tempDate.getUTCMonth();
    day = tempDate.getUTCDate();
  }

  const monthStr = String(month + 1).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  return `${year}-${monthStr}-${dayStr}`;
}

function getISTBusinessDayBoundary() {
  const now = new Date();
  const dateStr = getISTBusinessDateStr(now);
  const isoStr = `${dateStr}T05:00:00.000+05:30`;
  return new Date(isoStr);
}

class TableLock {
  constructor() {
    this.promise = Promise.resolve();
  }
  
  async acquire() {
    let resolve;
    const nextPromise = new Promise(r => resolve = r);
    const currentPromise = this.promise;
    this.promise = nextPromise;
    await currentPromise;
    return () => resolve();
  }
}

if (!global.tableLocks) {
  global.tableLocks = new Map();
}

function getTableLock(tableNo) {
  if (!global.tableLocks.has(tableNo)) {
    global.tableLocks.set(tableNo, new TableLock());
  }
  return global.tableLocks.get(tableNo);
}



export async function POST(req) {
  try {
    const body = await req.json();
    const { tableNumber, customerName, customerMobile, items } = body;
    const orderFloor = ["maaistaa", "club", "rooftop"].includes(body.floor?.toLowerCase()) ? body.floor.toLowerCase() : "club";

    const hasClearItem = (items || []).some(
      item => (item.name || "").toLowerCase().trim() === "clear" || (item.name || "").toLowerCase().trim() === "clear table"
    );

    const isPOSOrder = 
      body.isPOS === true || 
      body.source === "pos" ||
      !customerName || 
      customerName.trim() === "" ||
      customerName.trim() === "Walk-in Guest" ||
      !customerMobile ||
      customerMobile.trim() === "" ||
      customerMobile.trim() === "0000000000";

    const cleanCustomerName = isPOSOrder ? (customerName ? customerName.trim() : "Walk-in Guest") : (customerName ? customerName.trim() : "");
    const cleanCustomerMobile = isPOSOrder ? (customerMobile ? customerMobile.trim() : "") : (customerMobile ? customerMobile.trim() : "");

    // Validation checks
    if (!tableNumber) {
      return NextResponse.json({ success: false, error: "Table number is required" }, { status: 400 });
    }

    if (!isPOSOrder) {
      if (!customerName || customerName.trim().length < 2) {
        return NextResponse.json({ success: false, error: "Please enter a valid Customer Name" }, { status: 400 });
      }
      if (!customerMobile || !/^\d{10}$/.test(customerMobile.trim())) {
        return NextResponse.json({ success: false, error: "Please enter a valid 10-digit mobile number" }, { status: 400 });
      }
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ success: false, error: "Cart is empty" }, { status: 400 });
    }

    const tableNum = parseInt(tableNumber);
    if (isNaN(tableNum)) {
      return NextResponse.json({ success: false, error: "Invalid table number" }, { status: 400 });
    }

    const lock = getTableLock(tableNum);
    const release = await lock.acquire();

    try {
      const conn = await posDbConnect();

      // ── Stock Validation Check ──
    const barItemsToCheck = hasClearItem ? [] : items.filter(item => item.menuSection === "bar" || item.category === "drinks");
    if (barItemsToCheck.length > 0) {
      for (const barItem of barItemsToCheck) {
        const itemNameLower = (barItem.name || "").toLowerCase().trim();
        const invItem = await conn.db.collection("inventories").findOne({
          name: { $regex: new RegExp(`^${itemNameLower}$`, "i") }
        });
        
        if (invItem && invItem.trackStock !== false) {
          const reqQty = parseInt(barItem.quantity) || 1;
          const currentStock = typeof invItem.stock === "number" ? invItem.stock : 0;
          
          if (currentStock < reqQty) {
            if (currentStock <= 0) {
              return NextResponse.json({
                success: false,
                error: `${barItem.name} is completely out of stock.`
              }, { status: 400 });
            } else {
              return NextResponse.json({
                success: false,
                error: `Only ${currentStock} quantity left for ${barItem.name}. Please adjust your order (tried to order ${reqQty}).`
              }, { status: 400 });
            }
          }
        }
      }
    }

    // Check if table has an active session
    let session = await conn.db.collection("tablesessions").findOne({
      tableNo: tableNum,
      status: { $ne: "COMPLETED" }
    });

    // Validate that the incoming mobile matches the session's mobile (if set)
    if (session && session.customerMobile && session.customerMobile !== cleanCustomerMobile && !isPOSOrder) {
      return NextResponse.json({ success: false, error: "Session expired or device not authorized" }, { status: 400 });
    }

    let order = null;
    let activeOrderId = null;


    if (!session) {
      // If no session, create order and session
      const orderInsert = await conn.db.collection("orders").insertOne({
        billNo: "",
        businessDate: getISTBusinessDateStr(),
        tableNo: tableNum,
        floor: orderFloor,
        items: [],
        subtotal: 0,
        sgst: 0,
        cgst: 0,
        discount: 0,
        roundOff: 0,
        grandTotal: 0,
        paidAmount: 0,
        paymentMode: "cash",
        orderStatus: "OPEN",
        isActive: true,
        date: new Date(),
        waiterName: "",
        orderType: "dine-in",
        customerName: cleanCustomerName,
        customerPhone: cleanCustomerMobile,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      activeOrderId = orderInsert.insertedId;
      order = await conn.db.collection("orders").findOne({ _id: activeOrderId });

      const sessionInsert = await conn.db.collection("tablesessions").insertOne({
        tableNo: tableNum,
        floor: orderFloor,
        activeOrderId: activeOrderId,
        status: "OPEN",
        kotIds: [],
        openedAt: new Date(),
        lastActivityAt: new Date(),
        paymentReceived: false,
        totalAmount: 0,
        waiterName: "",
        orderType: "dine-in",
        pendingItems: [],
        customerMobile: cleanCustomerMobile,
        customerName: cleanCustomerName
      });

      session = {
        _id: sessionInsert.insertedId,
        tableNo: tableNum,
        activeOrderId: activeOrderId,
        kotIds: [],
        waiterName: "",
        orderType: "dine-in"
      };
    } else {
      activeOrderId = session.activeOrderId;
      if (activeOrderId) {
        order = await conn.db.collection("orders").findOne({ _id: new ObjectId(activeOrderId) });
      }

      if (!order) {
        // If session exists but order is missing, create a new one
        const orderInsert = await conn.db.collection("orders").insertOne({
          billNo: "",
          businessDate: getISTBusinessDateStr(),
          tableNo: tableNum,
          items: [],
          subtotal: 0,
          sgst: 0,
          cgst: 0,
          discount: 0,
          roundOff: 0,
          grandTotal: 0,
          paidAmount: 0,
          paymentMode: "cash",
          orderStatus: "OPEN",
          isActive: true,
          date: new Date(),
          waiterName: session.waiterName || "",
          orderType: session.orderType || "dine-in",
          customerName: cleanCustomerName,
          customerPhone: cleanCustomerMobile,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        activeOrderId = orderInsert.insertedId;
        order = await conn.db.collection("orders").findOne({ _id: activeOrderId });

        await conn.db.collection("tablesessions").updateOne(
          { _id: session._id },
          { $set: { activeOrderId: activeOrderId } }
        );
      } else {
        // Update customer details if they are empty
        const updateFields = {};
        if (!order.customerPhone && cleanCustomerMobile) {
          updateFields.customerPhone = cleanCustomerMobile;
        }
        if (!order.customerName && cleanCustomerName) {
          updateFields.customerName = cleanCustomerName;
        }
        if (Object.keys(updateFields).length > 0) {
          await conn.db.collection("orders").updateOne(
            { _id: order._id },
            { $set: updateFields }
          );
        }
      }
    }

    // Generate KOT number based on daily 5 AM boundary in IST
    const boundary = getISTBusinessDayBoundary();
    const boundaryDateStr = getISTBusinessDateStr();

    // 1. Calculate highest existing sequence number among KOTs created today
    const kotsToday = await conn.db.collection("kots")
      .find({ createdAt: { $gte: boundary } }, { projection: { kotNo: 1 } })
      .toArray();

    let maxSeqInDb = 0;
    for (const k of kotsToday) {
      if (k.kotNo) {
        const match = k.kotNo.match(/KOT-(\d+)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeqInDb) maxSeqInDb = num;
        }
      }
    }

    // 2. Atomically increment the counter in kotcounters collection
    const kotCounterRes = await conn.db.collection("kotcounters").findOneAndUpdate(
      { businessDate: boundaryDateStr },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );

    let nextKOTCount = (kotCounterRes && typeof kotCounterRes.seq === 'number') 
      ? kotCounterRes.seq 
      : (kotCounterRes && kotCounterRes.value && typeof kotCounterRes.value.seq === 'number') 
        ? kotCounterRes.value.seq 
        : 1;

    // 3. If counter sequence is <= max existing KOT number today, boost it
    if (nextKOTCount <= maxSeqInDb) {
      nextKOTCount = maxSeqInDb + 1;
      await conn.db.collection("kotcounters").updateOne(
        { businessDate: boundaryDateStr },
        { $set: { seq: nextKOTCount } },
        { upsert: true }
      );
    }

    // 4. Absolute DB collision check: loop until candidate kotNo is 100% unique for today
    let kotNo = `KOT-${nextKOTCount.toString().padStart(3, '0')}`;
    let existingKOT = await conn.db.collection("kots").findOne({ kotNo, createdAt: { $gte: boundary } });
    while (existingKOT) {
      nextKOTCount += 1;
      kotNo = `KOT-${nextKOTCount.toString().padStart(3, '0')}`;
      await conn.db.collection("kotcounters").updateOne(
        { businessDate: boundaryDateStr },
        { $set: { seq: nextKOTCount } },
        { upsert: true }
      );
      existingKOT = await conn.db.collection("kots").findOne({ kotNo, createdAt: { $gte: boundary } });
    }

    // Map/Group items for KOT
    const kotItems = items.map(item => {
      const dept = (item.department === "bar" || item.menuSection === "bar") ? "bar" : "kitchen";
      return {
        menuItemId: item.menuItemId ? new ObjectId(item.menuItemId) : null,
        name: item.name,
        quantity: parseInt(item.quantity) || 1,
        price: parseFloat(item.price) || 0,
        department: dept,
        notes: item.notes || ""
      };
    });

    const departmentQueues = {};
    kotItems.forEach(item => {
      departmentQueues[item.department] = "PENDING";
    });

    // Create KOT record
    const kotInsertResult = await conn.db.collection("kots").insertOne({
      kotNo,
      orderId: order._id,
      tableNo: tableNum,
      floor: orderFloor,
      items: kotItems,
      status: 'PENDING',
      notes: '',
      waiterName: session.waiterName || '',
      orderType: session.orderType || 'dine-in',
      createdAt: new Date(),
      updatedAt: new Date(),
      departmentQueues,
      printCount: 0,
      inventoryDeducted: false,
      source: 'table'
    });
    const kotId = kotInsertResult.insertedId;

    // Recalculate order items and totals
    const newOrderItems = [
      ...(order.items || []),
      ...kotItems.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        notes: item.notes || ""
      }))
    ];

    const subtotal = newOrderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    
    // Fetch taxes from POS settings
    const settings = await conn.db.collection("settings").findOne({});
    const sgstRate = settings ? (parseFloat(settings.sgstRate) || 0) : 0;
    const cgstRate = settings ? (parseFloat(settings.cgstRate) || 0) : 0;

    const sgst = subtotal * (sgstRate / 100);
    const cgst = subtotal * (cgstRate / 100);
    const discount = order.discount || 0;
    const rawTotal = subtotal + sgst + cgst - discount;
    const grandTotal = Math.max(0, Math.round(rawTotal));
    const roundOff = grandTotal - rawTotal;

    // Update order with new items and totals
    await conn.db.collection("orders").updateOne(
      { _id: order._id },
      {
        $set: {
          items: newOrderItems,
          subtotal,
          sgst,
          cgst,
          discount,
          roundOff,
          grandTotal,
          orderStatus: 'KOT_SENT',
          updatedAt: new Date()
        },
        $push: { kotIds: kotId }
      }
    );

    // Update table session
    await conn.db.collection("tablesessions").updateOne(
      { _id: session._id },
      {
        $set: {
          status: 'KOT_SENT',
          pendingItems: [],
          totalAmount: grandTotal,
          lastActivityAt: new Date()
        },
        $push: { kotIds: kotId }
      }
    );



    // Sync to Unified Customer CRM
    if (cleanCustomerMobile && !hasClearItem && !isPOSOrder) {
      try {
        await syncCustomerFromSource({
          name: cleanCustomerName ? cleanCustomerName : "Walk-in Guest",
          phone: cleanCustomerMobile,
          source: "ordering-menu"
        });
        console.log(`[CRM Sync] Customer ${cleanCustomerName} (${cleanCustomerMobile}) synced successfully.`);
      } catch (crmErr) {
        console.error("Failed to sync ordering customer to CRM:", crmErr.message);
      }
    }

    const kitchenKOTItems = kotItems.filter(item => item.department !== "bar");
    const barKOTItems = kotItems.filter(item => item.department === "bar");

    // Legacy stock deduction removed to rely entirely on the POS backend's centralized Change Stream watcher instead (which correctly supports parent-child links and custom deduction units).




    // Notify the POS admin device to trigger the print dialog
    if (!hasClearItem) {
      await broadcastNewKOT(tableNum, kotNo, kotId);
    }

    return NextResponse.json({
      success: true,
      message: "Order placed successfully! Kitchen/Bar KOTs generated.",
      orderId: order._id.toString(),
      items: newOrderItems,
      totalAmount: grandTotal
    });
    } finally {
      release();
    }

  } catch (error) {
    console.error("Error placing POS order:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to place order" }, { status: 500 });
  }
}

/**
 * Notifies the POS admin device that a new KOT has been placed (from the menu page),
 * so the print dialog opens automatically. Fires-and-forgets, never blocks the response.
 */
async function broadcastNewKOT(tableNum, kotNo, kotId) {
  try {
    const socketUrl = process.env.POS_SOCKET_URL || process.env.NEXT_PUBLIC_POS_SOCKET_URL || "http://localhost:3000";
    const { io } = await import("socket.io-client");
    const tempSocket = io(socketUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 3000
    });

    await new Promise((resolve) => {
      tempSocket.on("connect", () => {
        tempSocket.emit("admin-broadcast", {
          event: "NEW_KOT",
          tableNumber: tableNum,
          kotNo,
          kotId: kotId ? kotId.toString() : undefined
        });
        tempSocket.emit("admin-broadcast", {
          event: "REFRESH_MENU"
        });
        setTimeout(() => {
          tempSocket.disconnect();
          resolve();
        }, 200);
      });

      tempSocket.on("connect_error", (err) => {
        console.warn("[Socket Broadcaster] Connection error:", err?.message || err);
        resolve();
      });

      // Timeout fallback
      setTimeout(resolve, 3500);
    });
  } catch (err) {
    // Non-critical: log but don't block the order
    console.error("Failed to broadcast NEW_KOT:", err?.message || err);
  }
}
