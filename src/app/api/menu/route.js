import { NextResponse } from "next/server";
import dbConnect, { posDbConnect, MenuItem } from "@/lib/db";
import { seedMenuItemsIfNeeded } from "@/lib/seed";

export async function GET(req) {
  try {
    let rawMenuItems = [];
    let rawInventories = [];
    let inventoryCategories = [];
    let menuCategories = [];
    let isPOS = false;

    try {
      const conn = await posDbConnect();
      const [menuRes, invRes, settingsRes] = await Promise.all([
        conn.db.collection("menuitems").find({}).toArray(),
        conn.db.collection("inventories").find({}).toArray(),
        conn.db.collection("settings").findOne({})
      ]);
      rawMenuItems = menuRes || [];
      rawInventories = invRes || [];
      inventoryCategories = settingsRes?.inventoryCategories || [];
      menuCategories = settingsRes?.menuCategories || [];
      if (rawMenuItems.length > 0 || rawInventories.length > 0) {
        isPOS = true;
      }
    } catch (posErr) {
      console.warn("Failed to connect to POS database, checking POS API:", posErr.message);
    }

    // If POS DB direct connection failed, fetch from live POS public API
    if (!isPOS) {
      try {
        const posApiUrl = process.env.NEXT_PUBLIC_POS_SOCKET_URL || "https://club17.onrender.com";
        const posRes = await fetch(`${posApiUrl}/api/public/menu`, {
          cache: "no-store",
          headers: { "Accept": "application/json" }
        });
        if (posRes.ok) {
          const posData = await posRes.json();
          if (posData?.success && (posData.menuItems?.length > 0 || posData.inventories?.length > 0)) {
            rawMenuItems = posData.menuItems || [];
            rawInventories = posData.inventories || [];
            inventoryCategories = posData.inventoryCategories || [];
            menuCategories = posData.menuCategories || [];
            isPOS = true;
          }
        }
      } catch (apiErr) {
        console.warn("Failed to fetch menu from POS public API:", apiErr.message);
      }
    }

    // If both POS DB and POS API failed or empty, fetch from local DB
    if (!isPOS) {
      await dbConnect();
      await seedMenuItemsIfNeeded();
      const localItems = await MenuItem.find({}).sort({ category: 1, name: 1 });
      const menuItems = localItems
        .filter(item => {
          const nameLower = (item.name || "").toLowerCase().trim();
          return nameLower !== "clear" && nameLower !== "clear table";
        })
        .map(item => {
        // Price conversion
        const cleanPrice = parseFloat(item.price.toString().replace(/[^0-9.]/g, "")) || 0;
        let rawCat = (item.category || "").toLowerCase().trim();
        if (rawCat === "desserts" || rawCat === "dessert") {
          rawCat = "bar_bites";
        }
        const menuSection = rawCat === "drinks" ? "bar" : "kitchen";
        return {
          _id: item._id.toString(),
          name: item.name,
          desc: item.desc,
          price: cleanPrice, // Number amount only
          tag: item.tag || "",
          badge: item.badge || "",
          category: rawCat,
          menuSection,
          createdAt: item.createdAt
        };
      });
      return NextResponse.json(
        { 
          success: true, 
          menuItems, 
          source: "local",
          inventoryCategories: ["drinks"],
          menuCategories: ["starters", "bar_bites"]
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
          }
        }
      );
    }

    // Build lookup maps from rawInventories for availability checks
    const inventoryByName = new Map();
    const inventoryById = new Map();
    for (const inv of rawInventories) {
      if (inv.name) {
        inventoryByName.set(inv.name.toLowerCase().trim(), inv);
      }
      if (inv._id) {
        inventoryById.set(inv._id.toString(), inv);
      }
    }

    // Helper function to check if item or its parent is enabled via manager toggle
    function isItemActive(inv) {
      if (!inv) return false;
      if (inv.isAvailable === false || inv.available === false) return false;
      if (inv.linkInventoryId) {
        const parentIdStr = typeof inv.linkInventoryId === "object"
          ? inv.linkInventoryId._id?.toString()
          : inv.linkInventoryId?.toString();
        const parent = parentIdStr ? inventoryById.get(parentIdStr) : null;
        if (parent && (parent.isAvailable === false || parent.available === false)) {
          return false;
        }
      }
      return true;
    }

    // Helper function to calculate effective portion/unit stock for menu ordering
    function getEffectiveStock(inv) {
      if (!inv) return 0;
      if (inv.trackStock === false) return undefined;

      if (inv.linkInventoryId) {
        const parentIdStr = typeof inv.linkInventoryId === "object"
          ? inv.linkInventoryId._id?.toString()
          : inv.linkInventoryId?.toString();
        const parent = parentIdStr ? inventoryById.get(parentIdStr) : null;
        if (parent) {
          if (parent.trackStock === false) return undefined;
          const parentStock = typeof parent.stock === "number" ? parent.stock : 0;
          const reqQty = Number(inv.stockDeductionQty) > 0 ? Number(inv.stockDeductionQty) : 1;
          if (parentStock <= 0 || parentStock < reqQty) return 0;
          return Math.floor(parentStock / reqQty);
        }
      }

      if (typeof inv.stock === "number") {
        return Math.max(0, Math.floor(inv.stock));
      }
      return 0;
    }

    const trimmedMenuCats = (menuCategories || []).map(c => c.trim().toLowerCase());
    const trimmedInvCats = (inventoryCategories || []).map(c => c.trim().toLowerCase());
    const trimmedInvCatsSet = new Set(trimmedInvCats);

    // ── Build Drinks / Bar Items directly from rawInventories ──
    // Inventory is the sole source of truth for all bar items (prices, stock, drag-and-drop order)
    const barItems = [];
    const invNamesSet = new Set();

    for (const inv of rawInventories) {
      if (!inv.name) continue;
      const cleanName = inv.name.trim();
      const invNameLower = cleanName.toLowerCase();
      if (invNameLower === "clear" || invNameLower === "clear table") continue;
      invNamesSet.add(invNameLower);

      if (!isItemActive(inv)) continue;

      const effectiveStock = getEffectiveStock(inv);
      // Hide out-of-stock items from the customer menu
      if (inv.trackStock !== false && effectiveStock !== undefined && effectiveStock <= 0) {
        continue;
      }

      const cleanPrice = parseFloat((inv.price || 0).toString().replace(/[^0-9.]/g, "")) || 0;
      const isAlcohol = inv.isAlcoholic || inv.isAlcohol || false;

      barItems.push({
        _id: inv._id ? inv._id.toString() : `inv_${invNameLower}`,
        name: cleanName,
        desc: inv.desc || cleanName,
        price: cleanPrice,
        tag: inv.category || "drinks",
        badge: isAlcohol ? "Alcoholic" : "Non-Alcoholic",
        category: inv.category ? inv.category.trim() : "Drinks",
        menuSection: "bar",
        stock: effectiveStock,
        trackStock: inv.trackStock !== false,
        order: typeof inv.order === "number" ? inv.order : 0,
        department: "bar",
        createdAt: inv.createdAt || new Date()
      });
    }

    // ── Build Food / Kitchen Items from rawMenuItems ──
    // Exclude any item that belongs to inventory or inventory categories (prevents stale drink duplicates)
    const kitchenItems = rawMenuItems
      .filter(item => {
        if (item.available === false) return false;
        if (item.trackStock !== false && typeof item.stock === "number" && item.stock <= 0) return false;
        const nameLower = (item.name || "").toLowerCase().trim();
        if (nameLower === "clear" || nameLower === "clear table") return false;
        if (invNamesSet.has(nameLower)) return false; // Managed in inventory

        const rawCat = (item.category || "").toLowerCase().trim();
        if (trimmedInvCatsSet.has(rawCat)) return false; // Belongs to bar inventory categories

        // If department is bar and not in menuCategories (e.g. Soft Beverages/Shakes), skip
        if (item.department === "bar" && !trimmedMenuCats.includes(rawCat)) {
          return false;
        }

        return true;
      })
      .map(item => {
        const rawCat = (item.category || "").toLowerCase().trim();
        const trimmedMenuCategories = (menuCategories || []).map(c => c.trim()).filter(Boolean);
        const matchedCategory = trimmedMenuCategories.find(c => c.toLowerCase() === rawCat) || item.category?.trim() || "Mains";

        const cleanPrice = parseFloat((item.price || 0).toString().replace(/[^0-9.]/g, "")) || 0;

        return {
          _id: item._id.toString(),
          name: item.name.trim(),
          desc: item.desc || `${item.name.trim()} prepared fresh.`,
          price: cleanPrice,
          tag: item.tag || item.category || "",
          badge: item.isVeg === false ? "Non-Veg" : "Veg",
          category: matchedCategory,
          menuSection: "kitchen",
          stock: typeof item.stock === "number" ? item.stock : undefined,
          trackStock: item.trackStock !== false,
          order: typeof item.order === "number" ? item.order : 0,
          department: "kitchen",
          createdAt: item.createdAt || new Date()
        };
      });

    // ── Sort kitchen & bar items ──
    kitchenItems.sort((a, b) => {
      const catAIndex = trimmedMenuCats.indexOf(a.category.toLowerCase());
      const catBIndex = trimmedMenuCats.indexOf(b.category.toLowerCase());
      const indexA = catAIndex === -1 ? 999999 : catAIndex;
      const indexB = catBIndex === -1 ? 999999 : catBIndex;
      if (indexA !== indexB) return indexA - indexB;
      const orderA = typeof a.order === "number" ? a.order : 0;
      const orderB = typeof b.order === "number" ? b.order : 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    barItems.sort((a, b) => {
      const catAIndex = trimmedInvCats.indexOf(a.category.toLowerCase());
      const catBIndex = trimmedInvCats.indexOf(b.category.toLowerCase());
      const indexA = catAIndex === -1 ? 999999 : catAIndex;
      const indexB = catBIndex === -1 ? 999999 : catBIndex;
      if (indexA !== indexB) return indexA - indexB;
      const orderA = typeof a.order === "number" ? a.order : 0;
      const orderB = typeof b.order === "number" ? b.order : 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    const menuItems = [...kitchenItems, ...barItems];

    return NextResponse.json(
      { 
        success: true, 
        menuItems, 
        source: "pos",
        inventoryCategories,
        menuCategories
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120"
        }
      }
    );
  } catch (error) {
    console.error("Error retrieving menu items:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
