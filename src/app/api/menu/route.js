import { NextResponse } from "next/server";
import dbConnect, { posDbConnect, MenuItem } from "@/lib/db";
import { seedMenuItemsIfNeeded } from "@/lib/seed";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawFloor = (searchParams.get("floor") || "").toLowerCase().trim();
    const floor = ["maaistaa", "club", "rooftop"].includes(rawFloor) ? rawFloor : "club";

    let rawMenuItems = [];
    let rawInventories = [];
    let inventoryCategories = [];
    let menuCategories = [];
    let floorConfig = {};
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
      floorConfig = settingsRes?.floorConfig || {};
      inventoryCategories = settingsRes?.inventoryCategories || [];
      menuCategories = floorConfig?.[floor]?.menuCategories || settingsRes?.menuCategories || [];
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
        const posRes = await fetch(`${posApiUrl}/api/public/menu?floor=${floor}`, {
          cache: "no-store",
          headers: { "Accept": "application/json" }
        });
        if (posRes.ok) {
          const posData = await posRes.json();
          if (posData?.success && (posData.menuItems?.length > 0 || posData.inventories?.length > 0)) {
            rawMenuItems = posData.menuItems || [];
            rawInventories = posData.inventories || [];
            inventoryCategories = posData.inventoryCategories || [];
            menuCategories = posData.floorConfig?.[floor]?.menuCategories || posData.menuCategories || [];
            isPOS = true;
          }
        }
      } catch (apiErr) {
        console.warn("Failed to fetch menu from POS public API:", apiErr.message);
      }
    }

    // If both POS DB and POS API failed or empty, fallback
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
          const cleanPrice = parseFloat(item.price.toString().replace(/[^0-9.]/g, "")) || 0;
          let rawCat = (item.category || "").toLowerCase().trim();
          const isDrink = rawCat === "drinks" || rawCat === "beverages";
          return {
            _id: item._id.toString(),
            name: item.name,
            desc: item.desc,
            price: cleanPrice,
            tag: item.tag || "",
            badge: item.badge || "",
            category: item.category || "General",
            menuSection: isDrink ? "bar" : "kitchen",
            department: isDrink ? "bar" : "kitchen",
            createdAt: item.createdAt
          };
        });
      return NextResponse.json(
        { 
          success: true, 
          floor,
          menuItems, 
          source: "local",
          foodCategories: ["Starters", "Mains"],
          drinkCategories: ["Drinks"],
          menuCategories: ["Starters", "Mains"],
          inventoryCategories: ["Drinks"]
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

    const isDrinkCategory = (catName = "") => {
      const c = catName.toLowerCase().trim();
      return /drink|beverage|juice|cocktail|beer|shake|soda|coffee|tea|wine|liquor|whisky|vodka|rum|mocktail|spirits/i.test(c);
    };

    const orderedFloorCategories = (menuCategories || []).map(c => c.trim()).filter(Boolean);

    // ── Build Drinks / Bar Items ──
    const barItems = [];
    const invNamesSet = new Set();

    // Bar & Liquor inventory is ONLY included for Club floor!
    if (floor === "club") {
      for (const inv of rawInventories) {
        if (!inv.name) continue;
        const cleanName = inv.name.trim();
        const invNameLower = cleanName.toLowerCase();
        if (invNameLower === "clear" || invNameLower === "clear table") continue;
        invNamesSet.add(invNameLower);

        if (!isItemActive(inv)) continue;

        const effectiveStock = getEffectiveStock(inv);
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
    }

    // ── Process rawMenuItems filtered by Floor ──
    const kitchenItems = [];

    for (const item of rawMenuItems) {
      if (!item.name) continue;
      const cleanName = item.name.trim();
      const nameLower = cleanName.toLowerCase();
      if (nameLower === "clear" || nameLower === "clear table") continue;
      if (item.available === false) continue;
      if (item.trackStock !== false && typeof item.stock === "number" && item.stock <= 0) continue;

      // Filter by floor
      const itemFloors = Array.isArray(item.floors) && item.floors.length > 0 ? item.floors : ["maaistaa", "club", "rooftop"];
      if (!itemFloors.includes(floor)) continue;

      // If on club and item matches an inventory item, inventory takes precedence
      if (floor === "club" && invNamesSet.has(nameLower)) continue;

      // Resolve floor dynamic price
      const floorPrice = item.floorPrices?.[floor];
      const effectivePrice = (floorPrice !== undefined && floorPrice !== null && !isNaN(floorPrice) && Number(floorPrice) > 0)
        ? Number(floorPrice)
        : (parseFloat(item.price) || 0);

      const itemCategory = item.category?.trim() || "General";
      const isDrink = item.department === "bar" || isDrinkCategory(itemCategory);

      if (isDrink) {
        barItems.push({
          _id: item._id.toString(),
          name: cleanName,
          desc: item.desc || `${cleanName} prepared fresh.`,
          price: effectivePrice,
          tag: item.tag || itemCategory,
          badge: item.isAlcoholic ? "Alcoholic" : "Non-Alcoholic",
          category: itemCategory,
          menuSection: "bar",
          stock: typeof item.stock === "number" ? item.stock : undefined,
          trackStock: item.trackStock !== false,
          order: typeof item.order === "number" ? item.order : 0,
          department: "bar",
          createdAt: item.createdAt || new Date()
        });
      } else {
        kitchenItems.push({
          _id: item._id.toString(),
          name: cleanName,
          desc: item.desc || `${cleanName} prepared fresh.`,
          price: effectivePrice,
          tag: item.tag || itemCategory,
          badge: item.isVeg === false ? "Non-Veg" : "Veg",
          category: itemCategory,
          menuSection: "kitchen",
          stock: typeof item.stock === "number" ? item.stock : undefined,
          trackStock: item.trackStock !== false,
          order: typeof item.order === "number" ? item.order : 0,
          department: "kitchen",
          createdAt: item.createdAt || new Date()
        });
      }
    }

    // ── Extract categories in preserved floor order ──
    const foodCatSet = new Set(kitchenItems.map(i => i.category));
    const foodCategories = orderedFloorCategories.filter(c => foodCatSet.has(c));
    for (const c of foodCatSet) {
      if (!foodCategories.includes(c)) foodCategories.push(c);
    }

    const drinkCatSet = new Set(barItems.map(i => i.category));
    const drinkCategories = orderedFloorCategories.filter(c => drinkCatSet.has(c));
    for (const c of drinkCatSet) {
      if (!drinkCategories.includes(c)) drinkCategories.push(c);
    }

    // ── Sort kitchen & bar items by category order, then item order ──
    kitchenItems.sort((a, b) => {
      const idxA = foodCategories.indexOf(a.category);
      const idxB = foodCategories.indexOf(b.category);
      const posA = idxA === -1 ? 999999 : idxA;
      const posB = idxB === -1 ? 999999 : idxB;
      if (posA !== posB) return posA - posB;
      const ordA = typeof a.order === "number" ? a.order : 0;
      const ordB = typeof b.order === "number" ? b.order : 0;
      if (ordA !== ordB) return ordA - ordB;
      return a.name.localeCompare(b.name);
    });

    barItems.sort((a, b) => {
      const idxA = drinkCategories.indexOf(a.category);
      const idxB = drinkCategories.indexOf(b.category);
      const posA = idxA === -1 ? 999999 : idxA;
      const posB = idxB === -1 ? 999999 : idxB;
      if (posA !== posB) return posA - posB;
      const ordA = typeof a.order === "number" ? a.order : 0;
      const ordB = typeof b.order === "number" ? b.order : 0;
      if (ordA !== ordB) return ordA - ordB;
      return a.name.localeCompare(b.name);
    });

    const menuItems = [...kitchenItems, ...barItems];

    return NextResponse.json(
      { 
        success: true, 
        floor,
        menuItems, 
        foodCategories,
        drinkCategories,
        menuCategories: foodCategories,
        inventoryCategories: drinkCategories,
        source: "pos"
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60"
        }
      }
    );
  } catch (error) {
    console.error("Error retrieving menu items:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
