"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { io } from "socket.io-client";

const POS_SOCKET_URL = process.env.NEXT_PUBLIC_POS_SOCKET_URL || (typeof window !== "undefined" ? window.location.origin : "");

const formatPrice = (priceVal) => {
  if (!priceVal) return "";
  const num = typeof priceVal === "number" ? priceVal : parseFloat(priceVal.toString().replace(/[^0-9.]/g, "")) || 0;
  if (num === 0) return "";
  return `₹${Number.isInteger(num) ? num : num.toFixed(2)}`;
};

function MenuContent() {
  const searchParams = useSearchParams();
  const tableParam = searchParams.get("table");
  const [tableNumber, setTableNumber] = useState(null);

  // Bottom Nav Tabs: "kitchen", "bar", "cart", "history"
  const [activeTab, setActiveTab] = useState("kitchen");
  
  // State for menu items
  const [menuItems, setMenuItems] = useState([]);
  const [inventoryCategories, setInventoryCategories] = useState([]);
  const [menuCategories, setMenuCategories] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubCategory, setSelectedSubCategory] = useState("all");
  const [dietFilter, setDietFilter] = useState("all");

  // State for cart
  const [cart, setCart] = useState([]);
  
  // State for Customer Info
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  // Table & Order Status from Server
  const [tableStatus, setTableStatus] = useState("idle");
  const prevTableStatusRef = useRef("idle"); // track previous status to detect busy→idle transition
  const [activeOrder, setActiveOrder] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // UI States
  const [errors, setErrors] = useState({});
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingItemToAdd, setPendingItemToAdd] = useState(null);

  // Parse table parameter and load customer details from localStorage
  useEffect(() => {
    if (tableParam) {
      const parsed = parseInt(tableParam);
      if (!isNaN(parsed)) {
        setTableNumber(parsed);
      }
    }
    const tabParam = searchParams.get("tab");
    if (tabParam === "bar" || tabParam === "drinks") {
      setActiveTab("bar");
    }
    
    // Load local customer profile if exists and not expired (24 hours)
    const savedName = localStorage.getItem("humtum_cust_name");
    const savedMobile = localStorage.getItem("humtum_cust_mobile");
    const savedTime = localStorage.getItem("humtum_cust_registered_time");
    
    const oneDayMs = 24 * 60 * 60 * 1000;
    const isStillValid = savedTime && (Date.now() - parseInt(savedTime, 10) < oneDayMs);

    if (savedName && savedMobile && isStillValid) {
      setCustomerName(savedName);
      setCustomerMobile(savedMobile);
      setIsRegistered(true);
    } else {
      localStorage.removeItem("humtum_cust_name");
      localStorage.removeItem("humtum_cust_mobile");
      localStorage.removeItem("humtum_cust_registered_time");
      setIsRegistered(false);
      setShowRegisterModal(true);
    }
    // Load persisted active order if any (for refresh resilience)
    const savedActiveOrder = localStorage.getItem("humtum_active_order");
    if (savedActiveOrder) {
      try {
        setActiveOrder(JSON.parse(savedActiveOrder));
      } catch (e) {
        console.error("Failed to parse persisted active order", e);
        localStorage.removeItem("humtum_active_order");
      }
    }
  }, [tableParam, searchParams]);

  // Persist activeOrder changes to localStorage
  useEffect(() => {
    if (activeOrder) {
      try {
        localStorage.setItem("humtum_active_order", JSON.stringify(activeOrder));
      } catch (e) {
        console.error("Failed to persist active order", e);
      }
    } else {
      localStorage.removeItem("humtum_active_order");
    }
  }, [activeOrder]);

  // Load persisted cart if any (for refresh resilience)
  useEffect(() => {
    const savedCart = localStorage.getItem("humtum_cart");
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        setCart(parsedCart);
      } catch (e) {
        console.error("Failed to parse persisted cart", e);
        localStorage.removeItem("humtum_cart");
      }
    }
  }, []);

  // Persist cart changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("humtum_cart", JSON.stringify(cart));
    } catch (e) {
      console.error("Failed to persist cart", e);
    }
  }, [cart]);

  // Fetch Menu Items from Server
  const fetchMenu = async () => {
    try {
      const res = await fetch(`/api/menu?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        const fetchedItems = (data.menuItems || []).filter(
          (item) => !(item.name && item.name.toUpperCase() === "CLR")
        );
        setMenuItems(fetchedItems);
        setInventoryCategories(data.inventoryCategories || []);
        setMenuCategories(data.menuCategories || []);

        // Sanitize cart: remove out of stock items or adjust quantities dynamically
        setCart((prevCart) => {
          if (!prevCart || prevCart.length === 0) return prevCart;
          
          let cartChanged = false;
          const validCart = prevCart.map((cartItem) => {
            const menuItem = fetchedItems.find((m) => m._id === cartItem.menuItemId);
            if (!menuItem) {
              // Item is out of stock / removed from menu
              cartChanged = true;
              return null;
            }
            if (menuItem.menuSection === "bar" && menuItem.trackStock !== false && typeof menuItem.stock === "number") {
              if (cartItem.quantity > menuItem.stock) {
                cartChanged = true;
                if (menuItem.stock <= 0) {
                  return null;
                }
                return { ...cartItem, quantity: menuItem.stock };
              }
            }
            return cartItem;
          }).filter(Boolean);

          if (cartChanged) {
            syncCartToServer(validCart);
          }
          return validCart;
        });
      }
    } catch (err) {
      console.error("Failed to load menu:", err);
    } finally {
      setLoadingMenu(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  // Fetch Table Status and Active Orders from Server
  const fetchTableAndOrderStatus = async () => {
    if (!tableNumber) return;
    try {
      const res = await fetch(`/api/pos/table-status?table=${tableNumber}`);
      const data = await res.json();
      if (data.success) {
        const prevStatus = prevTableStatusRef.current;
        const newStatus = data.table.status;
        setTableStatus(newStatus);
        prevTableStatusRef.current = newStatus;

        if (newStatus === "busy") {
          // If customer matches local session, keep them active
          if (customerMobile && data.table.customerMobile === customerMobile) {
            setIsRegistered(true);
          } else if (customerMobile && data.table.customerMobile && data.table.customerMobile !== customerMobile) {
            // Table occupied by a different customer — lock out
            setIsRegistered(false);
          }
        } else if (newStatus === "idle" && prevStatus === "busy") {
          // Table just became idle — bill was printed. Clear everything.
          localStorage.removeItem("humtum_active_order");
          localStorage.removeItem("humtum_cart");
          setActiveOrder(null);
          setCart([]);
          setIsRegistered(false);
        }
        // If newStatus === "idle" and prevStatus was already "idle", do NOT touch the cart.
        // Customer may be browsing/adding items before placing first order.

        if (data.activeOrder) {
          setActiveOrder(data.activeOrder);
        } else {
          setActiveOrder(null);
        }
      }
    } catch (err) {
      console.error("Failed to load table status:", err);
    } finally {
      setLoadingStatus(false);
    }
  };

  // Socket.IO integration for live updates without refresh
  useEffect(() => {
    const socket = io(POS_SOCKET_URL, {
      transports: ["websocket"]
    });

    socket.on("connect", () => {
      console.log("Connected to POS Socket.IO");
      if (tableNumber) {
        socket.emit("join-table", tableNumber);
      }
    });

    socket.on("REFRESH_MENU", () => {
      console.log("REFRESH_MENU received, updating menu...");
      fetchMenu();
    });

    socket.on("INVENTORY_UPDATED", () => {
      console.log("INVENTORY_UPDATED received, updating menu...");
      fetchMenu();
    });

    socket.on("TABLE_SESSION_UPDATED", () => {
      console.log("TABLE_SESSION_UPDATED received, updating status...");
      if (tableNumber) {
        fetchTableAndOrderStatus();
      }
    });

    socket.on("TABLE_UPDATED", () => {
      console.log("TABLE_UPDATED received, updating status...");
      if (tableNumber) {
        fetchTableAndOrderStatus();
      }
    });

    socket.on("ORDER_COMPLETED", () => {
      console.log("ORDER_COMPLETED received, clearing status...");
      // Clear persisted active order and cart immediately
      localStorage.removeItem("humtum_active_order");
      localStorage.removeItem("humtum_cart");
      setActiveOrder(null);
      setCart([]);
      setTableStatus("idle");
      prevTableStatusRef.current = "idle";
      setIsRegistered(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [tableNumber, customerMobile]);

  useEffect(() => {
    fetchMenu();
    if (tableNumber) {
      fetchTableAndOrderStatus();
    }

    // Poll table status every 10 minutes as a backup in case WebSocket disconnects
    let statusInterval;
    if (tableNumber) {
      statusInterval = setInterval(() => {
        fetchTableAndOrderStatus();
      }, 600000);
    }

    // Poll menu every 10 minutes as a backup in case WebSocket disconnects
    const menuInterval = setInterval(() => {
      fetchMenu();
    }, 600000);

    return () => {
      if (statusInterval) clearInterval(statusInterval);
      clearInterval(menuInterval);
    };
  }, [tableNumber, customerMobile]);

  // Sync Cart items to MongoDB Server when cart changes (Real-time admin sync with 600ms debounce)
  const syncTimerRef = useRef(null);
  const syncCartToServer = (updatedCart) => {
    if (!tableNumber) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      try {
        await fetch("/api/pos/cart-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableNumber,
            customerName: customerName || undefined,
            customerMobile: customerMobile || undefined,
            activeCart: updatedCart
          })
        });
      } catch (err) {
        console.error("Failed to sync cart:", err);
      }
    }, 600);
  };

  // Add Item to Cart
  const handleAddToCart = (item) => {
    if (!isRegistered) {
      setPendingItemToAdd(item);
      setShowRegisterModal(true);
      return;
    }

    // Check stock limit for drinks
    const menuItem = menuItems.find((m) => m._id === item._id);
    if (menuItem && menuItem.menuSection === "bar" && menuItem.trackStock !== false && typeof menuItem.stock === "number") {
      const existing = cart.find((c) => c.menuItemId === item._id);
      const currentQty = existing ? existing.quantity : 0;
      if (currentQty + 1 > menuItem.stock) {
        alert(`Only ${menuItem.stock} quantity available for ${menuItem.name}.`);
        return;
      }
    }

    setCart((prevCart) => {
      const existing = prevCart.find((c) => c.menuItemId === item._id);
      let newCart;
      if (existing) {
        newCart = prevCart.map((c) =>
          c.menuItemId === item._id ? { ...c, quantity: c.quantity + 1 } : c
        );
      } else {
        const itemPrice = typeof item.price === "number" ? item.price : parseFloat(item.price.toString().replace(/[^0-9.]/g, "")) || 0;
        newCart = [
          ...prevCart,
          {
            menuItemId: item._id,
            name: item.name,
            price: itemPrice,
            quantity: 1,
            category: item.category,
            menuSection: item.menuSection || (menuItem ? menuItem.menuSection : "kitchen")
          }
        ];
      }
      syncCartToServer(newCart);
      return newCart;
    });
  };

  // Decrease quantity in Cart
  const handleRemoveFromCart = (item) => {
    setCart((prevCart) => {
      const existing = prevCart.find((c) => c.menuItemId === item._id);
      let newCart;
      if (existing && existing.quantity > 1) {
        newCart = prevCart.map((c) =>
          c.menuItemId === item._id ? { ...c, quantity: c.quantity - 1 } : c
        );
      } else {
        newCart = prevCart.filter((c) => c.menuItemId !== item._id);
      }
      syncCartToServer(newCart);
      return newCart;
    });
  };

  const getCartItemQuantity = (itemId) => {
    const found = cart.find((c) => c.menuItemId === itemId);
    return found ? found.quantity : 0;
  };

  // Register Customer Profile Details (Check-In Table Session)
  const handleRegister = (e) => {
    if (e) e.preventDefault();
    const newErrors = {};
    if (!customerName || customerName.trim().length < 2) {
      newErrors.name = "Enter a valid Name (minimum 2 characters)";
    }
    if (!customerMobile || !/^\d{10}$/.test(customerMobile.trim())) {
      newErrors.mobile = "Enter a valid 10-digit Mobile Number";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const trimmedName = customerName.trim();
    const trimmedMobile = customerMobile.trim();

    // Save to local storage
    localStorage.setItem("humtum_cust_name", trimmedName);
    localStorage.setItem("humtum_cust_mobile", trimmedMobile);
    localStorage.setItem("humtum_cust_registered_time", Date.now().toString());
    setIsRegistered(true);
    setErrors({});
    setShowRegisterModal(false);

    // Store customer details in CRM and Database immediately (no matter if order is placed or not)
    fetch("/api/pos/register-customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableNumber,
        customerName: trimmedName,
        customerMobile: trimmedMobile
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          console.log("[Register Customer] Successfully registered customer in CRM and Database");
          fetchTableAndOrderStatus();
        } else {
          console.error("[Register Customer] Failed to register:", data.error);
        }
      })
      .catch(err => {
        console.error("[Register Customer] Network/Registration error:", err);
      });
    
    if (pendingItemToAdd) {
      const item = pendingItemToAdd;
      setPendingItemToAdd(null);

      // Check stock limit for drinks in register auto-add
      const menuItem = menuItems.find((m) => m._id === item._id);
      if (menuItem && menuItem.menuSection === "bar" && menuItem.trackStock !== false && typeof menuItem.stock === "number") {
        const existing = cart.find((c) => c.menuItemId === item._id);
        const currentQty = existing ? existing.quantity : 0;
        if (currentQty + 1 > menuItem.stock) {
          alert(`Only ${menuItem.stock} quantity available for ${menuItem.name}.`);
          return;
        }
      }

      setCart((prevCart) => {
        const existing = prevCart.find((c) => c.menuItemId === item._id);
        let newCart;
        if (existing) {
          newCart = prevCart.map((c) =>
            c.menuItemId === item._id ? { ...c, quantity: c.quantity + 1 } : c
          );
        } else {
          const itemPrice = typeof item.price === "number" ? item.price : parseFloat(item.price.toString().replace(/[^0-9.]/g, "")) || 0;
          newCart = [
            ...prevCart,
            {
              menuItemId: item._id,
              name: item.name,
              price: itemPrice,
              quantity: 1,
              category: item.category,
              menuSection: item.menuSection || (menuItem ? menuItem.menuSection : "kitchen")
            }
          ];
        }
        syncCartToServer(newCart);
        return newCart;
      });
    } else {
      // Sync cart with credentials
      syncCartToServer(cart);
    }
  };

  // Submit Order / Place KOT on POS System
  const handlePlaceOrder = async () => {
    if (!isRegistered) {
      setShowRegisterModal(true);
      return;
    }

    if (cart.length === 0) return;

    setPlacingOrder(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/pos/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableNumber,
          customerName,
          customerMobile,
          items: cart
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setCart([]); // Clear cart locally
        setOrderSuccess(true);
        fetchTableAndOrderStatus();
        
        // Hide success message after 4 seconds
        setTimeout(() => {
          setOrderSuccess(false);
          setActiveTab("history");
        }, 3000);
      } else {
        setErrorMsg(data.error || "Failed to submit order. Please try again.");
      }
    } catch (err) {
      console.error("Order submission failed:", err);
      setErrorMsg("Network error. Please try again.");
    } finally {
      setPlacingOrder(false);
    }
  };

  // Calculate items sum
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const isDifferentCustomer = tableStatus === "busy" && !isRegistered;

  // Get categories from settings or fall back to unique categories from menuItems
  const availableCategoriesForTab = (() => {
    let cats = [];
    if (activeTab === "kitchen") {
      if (menuCategories && menuCategories.length > 0) {
        cats = Array.from(new Set(menuCategories.map(c => c.trim()).filter(Boolean)));
      } else {
        cats = Array.from(
          new Set(
            menuItems
              .filter(item => item.menuSection === "kitchen")
              .map(item => item.category)
          )
        ).filter(Boolean).sort();
      }
    } else {
      if (inventoryCategories && inventoryCategories.length > 0) {
        cats = Array.from(new Set(inventoryCategories.map(c => c.trim()).filter(Boolean)));
      } else {
        cats = Array.from(
          new Set(
            menuItems
              .filter(item => item.menuSection === "bar")
              .map(item => item.category)
          )
        ).filter(Boolean).sort();
      }
    }
    return ["All", ...cats];
  })();

  // Ensure selectedSubCategory remains valid if categories change
  useEffect(() => {
    if (availableCategoriesForTab.length > 0) {
      const lowerCats = availableCategoriesForTab.map(c => c.toLowerCase().trim());
      if (selectedSubCategory !== "all" && !lowerCats.includes(selectedSubCategory.toLowerCase().trim())) {
        setSelectedSubCategory("all");
      }
    }
  }, [availableCategoriesForTab, selectedSubCategory]);

  // Filter menu items by active tab and sub-category
  const displayedItems = menuItems.filter((item) => {
    // 1. Tab check
    const matchesTab =
      activeTab === "kitchen"
        ? item.menuSection === "kitchen"
        : item.menuSection === "bar";
        
    // 2. Subcategory check (POS category)
    const matchesSubCategory =
      selectedSubCategory.toLowerCase().trim() === "all" ||
      (item.category && selectedSubCategory && item.category.toLowerCase().trim() === selectedSubCategory.toLowerCase().trim());

    // 3. Search query check
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.desc.toLowerCase().includes(searchQuery.toLowerCase());

    // 4. Diet / Alcohol check
    let matchesDiet = true;
    if (dietFilter !== "all") {
      if (dietFilter === "veg") {
        matchesDiet = item.badge === "Veg";
      } else if (dietFilter === "non-veg") {
        matchesDiet = item.badge === "Non-Veg";
      } else if (dietFilter === "alcoholic") {
        matchesDiet = item.badge === "Alcoholic";
      } else if (dietFilter === "non-alcoholic") {
        matchesDiet = item.badge === "Non-Alcoholic";
      }
    }

    return matchesTab && matchesSubCategory && matchesSearch && matchesDiet;
  });

  const isVegItem = (item) => {
    if (item.menuSection === "bar") {
      return item.badge === "Non-Alcoholic";
    }
    return item.badge === "Veg" || (item.tag && item.tag.toLowerCase().includes("veg") && !item.tag.toLowerCase().includes("non"));
  };

  return (
    <div style={styles.root} className="menu-root">
      {/* Dynamic Styling Overrides for Mobile Simulator layout */}
      <style>{`
        body {
          background-color: #f7f6f2 !important;
          color: #333333 !important;
        }
        .menu-search-input::placeholder {
          color: #999999;
        }
        .active-tab-nav {
          color: #C9A84C !important;
          font-weight: bold !important;
        }
        .active-tab-nav svg {
          stroke: #C9A84C !important;
        }

        /* Top Header Green Theme overrides for all screens */
        .menu-header {
          background-color: var(--bg0) !important;
          border-bottom: 1px solid rgba(201, 168, 76, 0.15) !important;
        }
        .brand-title {
          color: var(--tc) !important;
        }
        .brand-subtitle {
          color: var(--g1) !important;
        }
        .table-badge {
          background-color: var(--bg2) !important;
          border-color: rgba(201, 168, 76, 0.25) !important;
        }
        .table-label {
          color: var(--tc3) !important;
        }
        .table-num-val {
          color: var(--g1) !important;
        }

        /* Responsive Overrides (Mobile-First approach) */
        @media (min-width: 501px) {
          .menu-root {
            max-width: 100% !important;
            border-left: none !important;
            border-right: none !important;
          }
          .menu-main {
            padding: 24px 32px !important;
          }
          .menu-header {
            padding: 20px 32px !important;
          }
          .menu-bottom-nav {
            max-width: 100% !important;
            justify-content: center !important;
            gap: 60px !important;
            border-top: 1px solid #eeeeee !important;
          }
          .menu-floating-cart {
            max-width: 500px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
          }
          .menu-list {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 16px !important;
          }
          .cart-grid {
            display: grid !important;
            grid-template-columns: 1.2fr 1fr !important;
            gap: 24px !important;
            align-items: start !important;
          }
          .history-grid {
            display: grid !important;
            grid-template-columns: 1.2fr 1fr !important;
            gap: 24px !important;
            align-items: start !important;
          }
          .menu-modal-backdrop {
            align-items: center !important;
          }
          .menu-modal-content {
            border-radius: 16px !important;
            max-width: 480px !important;
            padding: 24px !important;
            animation: modalFadeIn 0.3s ease-out !important;
          }
        }

        @media (min-width: 1024px) {
          .menu-main {
            padding: 32px 80px !important;
          }
          .menu-header {
            padding: 24px 80px !important;
          }
          .menu-list {
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 20px !important;
          }
        }

        @media (min-width: 1440px) {
          .menu-main {
            padding: 40px 140px !important;
          }
          .menu-header {
            padding: 28px 140px !important;
          }
          .menu-list {
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 24px !important;
          }
        }

        @keyframes modalFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>

      {/* HEADER SECTION */}
      <header style={styles.header} className="menu-header">
        <div style={styles.headerTop}>
          <div style={styles.restaurantInfo}>
            <img src="/logo.png" alt="CLUB 17 Logo" style={{ width: "38px", height: "38px", borderRadius: "50%", objectFit: "contain", background: "none" }} />
            <div>
              <h1 style={styles.brandTitle} className="brand-title">CLUB 17</h1>
              <p style={styles.brandSubtitle} className="brand-subtitle">DIGITAL MENU</p>
            </div>
          </div>
          <div style={styles.tableBadge} className="table-badge">
            <span style={styles.tableLabel} className="table-label">TABLE</span>
            <span style={styles.tableNumVal} className="table-num-val">{tableNumber || "—"}</span>
          </div>
        </div>
        
        {/* Real-time occupied table check banner */}
        {tableNumber && tableStatus === "busy" && !isRegistered && (
          <div style={styles.occupiedBanner}>
            ⚠️ Table is busy. If you are seated here, tap "Orders" or fill in Customer Details in "Cart".
          </div>
        )}
      </header>

      {/* MAIN CONTAINER */}
      <main style={styles.main} className="menu-main">
        {/* TABS 1: KITCHEN AND BAR MENUS */}
        {(activeTab === "kitchen" || activeTab === "bar") && (
          <div>
            {/* Search Bar */}
            <div style={styles.searchContainer}>
              <div style={styles.searchWrapper}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Search dishes or drinks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={styles.searchInput}
                  className="menu-search-input"
                />
              </div>
            </div>

            {/* Category Pills (Dynamically loaded from POS categories for active tab) */}
            {availableCategoriesForTab.length > 0 && (
              <div style={styles.pillsContainer}>
                {availableCategoriesForTab.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedSubCategory(cat)}
                    style={selectedSubCategory && cat && selectedSubCategory.toLowerCase().trim() === cat.toLowerCase().trim() ? styles.activePill : styles.pill}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Diet/Alcohol Filter Pills */}
            <div style={styles.dietFilterContainer}>
              {activeTab === "kitchen" ? (
                <>
                  <button
                    onClick={() => setDietFilter("all")}
                    style={dietFilter === "all" ? styles.activeDietPill : styles.dietPill}
                  >
                    All Types
                  </button>
                  <button
                    onClick={() => setDietFilter("veg")}
                    style={dietFilter === "veg" ? { ...styles.activeDietPill, borderColor: "#28a745", color: "#28a745" } : styles.dietPillVeg}
                  >
                    🟢 Veg
                  </button>
                  <button
                    onClick={() => setDietFilter("non-veg")}
                    style={dietFilter === "non-veg" ? { ...styles.activeDietPill, borderColor: "#dc3545", color: "#dc3545" } : styles.dietPillNonVeg}
                  >
                    🔴 Non-Veg
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setDietFilter("all")}
                    style={dietFilter === "all" ? styles.activeDietPill : styles.dietPill}
                  >
                    All Drinks
                  </button>
                  <button
                    onClick={() => setDietFilter("non-alcoholic")}
                    style={dietFilter === "non-alcoholic" ? { ...styles.activeDietPill, borderColor: "#28a745", color: "#28a745" } : styles.dietPillVeg}
                  >
                    🟢 Non-Alcoholic
                  </button>
                  <button
                    onClick={() => setDietFilter("alcoholic")}
                    style={dietFilter === "alcoholic" ? { ...styles.activeDietPill, borderColor: "#dc3545", color: "#dc3545" } : styles.dietPillNonVeg}
                  >
                    🔴 Alcoholic
                  </button>
                </>
              )}
            </div>

            {/* Alcohol classification legend */}
            {activeTab === "bar" && (
              <div style={styles.legendContainer}>
                <div style={styles.legendItem}>
                  <div style={styles.legendVegIndicator}>
                    <span style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: "#28a745",
                      display: "inline-block"
                    }} />
                  </div>
                  <span style={styles.legendText}>Non-Alcoholic</span>
                </div>
                <div style={styles.legendItem}>
                  <div style={styles.legendVegIndicator}>
                    <span style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: "#dc3545",
                      display: "inline-block"
                    }} />
                  </div>
                  <span style={styles.legendText}>Alcoholic</span>
                </div>
              </div>
            )}

            {/* Menu Items List */}
            {loadingMenu ? (
              <div style={styles.loadingWrapper}>
                <div style={styles.spinner}></div>
                <p style={styles.loadingText}>Fetching delicious selections...</p>
              </div>
            ) : displayedItems.length === 0 ? (
              <div style={styles.emptyWrapper}>
                <p style={styles.emptyText}>No matches found. Try searching something else!</p>
              </div>
            ) : (
              <div style={styles.menuList} className="menu-list">
                {displayedItems.map((item) => {
                  const qty = getCartItemQuantity(item._id);
                  const isVeg = isVegItem(item);
                  return (
                    <div key={item._id} style={styles.menuCard}>
                      <div style={styles.itemMeta}>
                        <div style={styles.vegIndicator}>
                          <span style={{
                            width: "10px",
                            height: "10px",
                            borderRadius: "50%",
                            backgroundColor: isVeg ? "#28a745" : "#dc3545",
                            display: "inline-block"
                          }} />
                        </div>
                        {item.badge && (
                          <span style={{
                            ...styles.itemBadge,
                            backgroundColor: isVeg ? "#e8f5e9" : "#ffebee",
                            color: isVeg ? "#28a745" : "#dc3545"
                          }}>
                            {item.badge}
                          </span>
                        )}
                        <h3 style={styles.itemName}>{item.name}</h3>
                        {formatPrice(item.price) ? <p style={styles.itemPrice}>{formatPrice(item.price)}</p> : null}
                      </div>

                      {/* Quantity Stepper */}
                      <div style={styles.stepperWrapper}>
                        {isDifferentCustomer ? (
                          <span style={{ fontSize: "11px", color: "#999", fontStyle: "italic" }}>Occupied</span>
                        ) : (item.menuSection === "bar" && item.trackStock !== false && item.stock <= 0) ? (
                          <span style={{ fontSize: "12px", color: "#dc3545", fontWeight: "bold" }}>Out of Stock</span>
                        ) : qty > 0 ? (
                          <div style={styles.stepper}>
                            <button onClick={() => handleRemoveFromCart(item)} style={styles.stepperBtn}>-</button>
                            <span style={styles.stepperVal}>{qty}</span>
                            <button onClick={() => handleAddToCart(item)} style={styles.stepperBtn}>+</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAddToCart(item)}
                            style={styles.addBtn}
                          >
                            + ADD
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ACTIVE SHOPPING CART */}
        {activeTab === "cart" && (
          <div style={styles.cartTabWrapper}>
            <h2 style={styles.tabHeading}>Your Cart</h2>

            {isDifferentCustomer ? (
              <div style={styles.emptyCartWrapper}>
                <div style={styles.emptyCartIcon}>🔒</div>
                <h3 style={styles.emptyCartText}>Table is occupied</h3>
                <p style={styles.emptyCartDesc}>
                  This table is currently occupied by another guest. Please contact staff if this is a mistake.
                </p>
              </div>
            ) : cart.length === 0 ? (
              <div style={styles.emptyCartWrapper}>
                <div style={styles.emptyCartIcon}>🛒</div>
                <h3 style={styles.emptyCartText}>Your cart is empty</h3>
                <p style={styles.emptyCartDesc}>Browse the menu tabs to select your culinary favorites.</p>
                <button onClick={() => setActiveTab("kitchen")} style={styles.viewMenuBtn}>
                  Browse Kitchen Menu
                </button>
              </div>
            ) : (
              <div className="cart-grid">
                <div className="cart-items-section">
                  {/* Cart Items List */}
                  <div style={styles.cartList}>
                    {cart.map((item) => (
                      <div key={item.menuItemId} style={styles.cartItemRow}>
                        <div style={{ flex: 1 }}>
                          <h4 style={styles.cartItemName}>{item.name}</h4>
                          <span style={styles.cartItemCategory}>{item.category.toUpperCase()}</span>
                        </div>
                        
                        <div style={styles.stepperMini}>
                          <button onClick={() => handleRemoveFromCart({ _id: item.menuItemId })} style={styles.stepperBtnMini}>-</button>
                          <span style={styles.stepperValMini}>{item.quantity}</span>
                          <button onClick={() => handleAddToCart({ _id: item.menuItemId, name: item.name, price: item.price, category: item.category })} style={styles.stepperBtnMini}>+</button>
                        </div>

                        <div style={styles.cartItemPriceCol}>
                          {formatPrice(item.price)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="cart-summary-section">
                  {/* Customer Details Summary */}
                  <div style={styles.summaryCard}>
                    <h3 style={styles.summaryCardHeader}>Customer Details</h3>
                    {isRegistered ? (
                      <div style={styles.customerDetailPill}>
                        <p>👤 <strong>{customerName}</strong></p>
                        <p>📞 <strong>+91 {customerMobile}</strong></p>
                      </div>
                    ) : (
                      <form onSubmit={handleRegister} style={styles.registerInlineForm}>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabelText}>Your Full Name *</label>
                          <input
                            type="text"
                            placeholder="First and Last Name"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            style={styles.formTextInput}
                          />
                          {errors.name && <p style={styles.errorLabel}>{errors.name}</p>}
                        </div>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabelText}>Mobile Number *</label>
                          <input
                            type="tel"
                            maxLength={10}
                            placeholder="10-digit number"
                            value={customerMobile}
                            onChange={(e) => setCustomerMobile(e.target.value.replace(/\D/g, ""))}
                            style={styles.formTextInput}
                          />
                          {errors.mobile && <p style={styles.errorLabel}>{errors.mobile}</p>}
                        </div>
                        <button type="submit" style={styles.saveInfoBtn}>
                          Save Details to Order
                        </button>
                      </form>
                    )}
                  </div>

                  {/* Bill Estimate Summary */}
                  <div style={styles.billDetailsCard}>
                    <h3 style={styles.billDetailsHeader}>Bill Summary</h3>
                    <div style={styles.billRow}>
                      <span>Subtotal</span>
                      <span>{formatPrice(cartTotalAmount)}</span>
                    </div>
                    <div style={styles.billRow}>
                      <span>CGST (2.5%)</span>
                      <span>{formatPrice(cartTotalAmount * 0.025)}</span>
                    </div>
                    <div style={styles.billRow}>
                      <span>SGST (2.5%)</span>
                      <span>{formatPrice(cartTotalAmount * 0.025)}</span>
                    </div>
                    <hr style={styles.billHr} />
                    <div style={styles.totalBillRow}>
                      <span>Grand Total</span>
                      <span>{formatPrice(cartTotalAmount * 1.05)}</span>
                    </div>
                  </div>

                  {/* Submit KOT / Place Order Button */}
                  {errorMsg && <p style={styles.orderError}>{errorMsg}</p>}
                  
                  {tableNumber ? (
                      <button
                        onClick={handlePlaceOrder}
                        style={styles.orderSubmitBtn}
                        disabled={placingOrder}
                      >
                        {placingOrder ? "Sending Order..." : "Order"}
                      </button>
                    ) : (
                      <p style={{ color: '#666', marginTop: '12px', textAlign: 'center' }}>
                        Please visit the restaurant, occupy a table, and then place your order here.
                      </p>
                    )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ORDER HISTORY (Placed KOTs) */}
        {activeTab === "history" && (
          <div style={styles.historyTabWrapper}>
            <h2 style={styles.tabHeading}>Active Order Summary</h2>
            
            {isDifferentCustomer ? (
              <div style={styles.emptyCartWrapper}>
                <div style={styles.emptyCartIcon}>🔒</div>
                <h3 style={styles.emptyCartText}>Table is occupied</h3>
                <p style={styles.emptyCartDesc}>
                  Order details are locked for privacy.
                </p>
              </div>
            ) : !activeOrder ? (
              <div style={styles.emptyCartWrapper}>
                <div style={styles.emptyCartIcon}>🍽️</div>
                <h3 style={styles.emptyCartText}>No placed orders found</h3>
                <p style={styles.emptyCartDesc}>Your active items will appear here once the KOT order is placed.</p>
              </div>
            ) : (
              <div className="history-grid">
                <div className="history-items-section">
                  <div style={styles.orderHeaderCard}>
                    <div style={styles.orderHeaderRow}>
                      <span><strong>Active Dine-In Order</strong></span>
                    </div>
                    <p style={{ margin: "5px 0 0 0", fontSize: "12px", color: "#666" }}>
                      Placed at: {new Date(activeOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Placed KOT Items List */}
                  <div style={styles.historyCardList}>
                    {activeOrder.items.map((item, idx) => (
                      <div key={idx} style={styles.historyItemRow}>
                        <div style={{ flex: 1 }}>
                          <h4 style={styles.histItemName}>{item.name}</h4>
                        </div>
                        <div style={styles.histItemQty}>
                          Qty: <strong>{item.quantity}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="history-warning-section">
                  <div style={styles.billWarningPill}>
                    * Table is marked as occupied. Please request staff to finalize and print the bill to complete checkout.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* FLOATING CART SUMMARY PILL (When viewing Menu tabs) */}
      {cartItemsCount > 0 && (activeTab === "kitchen" || activeTab === "bar") && (
        <div style={styles.floatingCart} className="menu-floating-cart" onClick={() => setActiveTab("cart")}>
          <div style={styles.floatingCartInfo}>
            <span style={styles.floatingCartCount}>{cartItemsCount} item{cartItemsCount > 1 ? "s" : ""} selected</span>
            <span style={styles.floatingCartTotal}>{formatPrice(cartTotalAmount)}</span>
          </div>
          <button style={styles.floatingCartBtn}>
            View Cart ➔
          </button>
        </div>
      )}

      {/* REGISTER MODAL OVERLAY (Slide up modal) */}
      {showRegisterModal && (
        <div style={styles.modalBackdrop} className="menu-modal-backdrop">
          <div style={styles.modalContent} className="menu-modal-content">
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Table Registration</h3>
              {isRegistered && (
                <button onClick={() => setShowRegisterModal(false)} style={styles.closeModalBtn}>×</button>
              )}
            </div>
            
            <p style={styles.modalDesc}>
              Please enter your contact details to lock Table {tableNumber || ""} and send the KOT.
            </p>

            <form onSubmit={handleRegister} style={styles.modalForm}>
              <div style={styles.formGroup}>
                <label style={styles.formLabelText}>Your Full Name *</label>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="First and Last Name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  style={styles.formTextInput}
                  required
                />
                {errors.name && <p style={styles.errorLabel}>{errors.name}</p>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabelText}>Mobile Number *</label>
                <input
                  type="tel"
                  autoComplete="off"
                  maxLength={10}
                  placeholder="10-digit Mobile Number"
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value.replace(/\D/g, ""))}
                  style={styles.formTextInput}
                  required
                />
                {errors.mobile && <p style={styles.errorLabel}>{errors.mobile}</p>}
              </div>

              <button type="submit" style={styles.modalSubmitBtn}>
                Save & Proceed to Order
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ORDER PLACED SUCCESS CARD */}
      {orderSuccess && (
        <div style={styles.successOverlay}>
          <div style={styles.successOverlayCard}>
            <div style={styles.checkCircle}>✓</div>
            <h3 style={styles.successTitleText}>KOT Sent Successfully</h3>
            <p style={styles.successBodyText}>
              Your order has been sent to the kitchen &amp; bar print queues. Table {tableNumber} is now active.
            </p>
          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION BAR */}
      <nav style={styles.bottomNav} className="menu-bottom-nav">
        <button
          onClick={() => {
            setActiveTab("kitchen");
            setSelectedSubCategory("all");
            setDietFilter("all");
          }}
          style={styles.navItem}
          className={activeTab === "kitchen" ? "active-tab-nav" : ""}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path>
            <path d="M7 2v20"></path>
            <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path>
          </svg>
          <span style={styles.navLabel}>Food</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("bar");
            setSelectedSubCategory("all");
            setDietFilter("all");
          }}
          style={styles.navItem}
          className={activeTab === "bar" ? "active-tab-nav" : ""}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2H2v2l10 10v6H8v2h8v-2h-4v-6L22 4z"></path>
          </svg>
          <span style={styles.navLabel}>Drinks</span>
        </button>

        <button
          onClick={() => setActiveTab("cart")}
          style={styles.navItem}
          className={activeTab === "cart" ? "active-tab-nav" : ""}
        >
          <div style={{ position: "relative" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            {cartItemsCount > 0 && (
              <span style={styles.badgeCount}>{cartItemsCount}</span>
            )}
          </div>
          <span style={styles.navLabel}>Cart</span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          style={styles.navItem}
          className={activeTab === "history" ? "active-tab-nav" : ""}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span style={styles.navLabel}>Orders</span>
        </button>
      </nav>
    </div>
  );
}

// STYLES SYSTEM FOR MOB-MOBILE INTERFACE (Light, Premium, Minimalist Layout)
const styles = {
  root: {
    maxWidth: "500px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    boxShadow: "0 0 20px rgba(0, 0, 0, 0.05)",
    fontFamily: "var(--font-lato), sans-serif",
    paddingBottom: "80px"
  },
  header: {
    backgroundColor: "#ffffff",
    padding: "16px",
    borderBottom: "1px solid #eeeeee",
    position: "sticky",
    top: 0,
    zIndex: 99
  },
  headerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  restaurantInfo: {
    display: "flex",
    alignItems: "center",
    gap: "10px"
  },
  logoCircle: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    backgroundColor: "#C9A84C",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "14px"
  },
  brandTitle: {
    margin: 0,
    fontSize: "16px",
    fontWeight: "bold",
    letterSpacing: "1px",
    color: "#333"
  },
  brandSubtitle: {
    margin: 0,
    fontSize: "10px",
    color: "#777",
    textTransform: "uppercase"
  },
  tableBadge: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: "#f7f6f2",
    border: "1px solid #e0dfd9",
    borderRadius: "6px",
    padding: "4px 10px"
  },
  tableLabel: {
    fontSize: "8px",
    fontWeight: "bold",
    color: "#888888",
    letterSpacing: "0.5px"
  },
  tableNumVal: {
    fontSize: "16px",
    fontWeight: "bold",
    color: "#C9A84C"
  },
  occupiedBanner: {
    backgroundColor: "#fff3cd",
    color: "#856404",
    border: "1px solid #ffeeba",
    padding: "8px 12px",
    borderRadius: "6px",
    fontSize: "11px",
    marginTop: "12px",
    textAlign: "center"
  },
  main: {
    flex: 1,
    padding: "16px"
  },
  searchContainer: {
    marginBottom: "15px"
  },
  searchWrapper: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#f7f6f2",
    borderRadius: "8px",
    padding: "8px 12px",
    gap: "8px",
    border: "1px solid #eaeaea"
  },
  searchInput: {
    border: "none",
    background: "transparent",
    outline: "none",
    width: "100%",
    fontSize: "14px",
    color: "#333"
  },
  pillsContainer: {
    display: "flex",
    gap: "8px",
    overflowX: "auto",
    paddingBottom: "10px",
    marginBottom: "15px",
    scrollbarWidth: "none",
    msOverflowStyle: "none"
  },
  pill: {
    padding: "6px 14px",
    borderRadius: "20px",
    border: "1px solid #e0e0e0",
    backgroundColor: "#ffffff",
    color: "#666666",
    fontSize: "12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.2s"
  },
  activePill: {
    padding: "6px 14px",
    borderRadius: "20px",
    border: "1px solid #C9A84C",
    backgroundColor: "#C9A84C",
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: "bold",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.2s"
  },
  dietFilterContainer: {
    display: "flex",
    gap: "8px",
    overflowX: "auto",
    paddingBottom: "8px",
    marginBottom: "15px",
    scrollbarWidth: "none",
    msOverflowStyle: "none"
  },
  dietPill: {
    padding: "5px 12px",
    borderRadius: "15px",
    border: "1px solid #e0e0e0",
    backgroundColor: "#ffffff",
    color: "#666666",
    fontSize: "11px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.2s"
  },
  dietPillVeg: {
    padding: "5px 12px",
    borderRadius: "15px",
    border: "1px solid #c3e6cb",
    backgroundColor: "#f4faf5",
    color: "#28a745",
    fontSize: "11px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.2s"
  },
  dietPillNonVeg: {
    padding: "5px 12px",
    borderRadius: "15px",
    border: "1px solid #f5c6cb",
    backgroundColor: "#fdf6f6",
    color: "#dc3545",
    fontSize: "11px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.2s"
  },
  activeDietPill: {
    padding: "5px 12px",
    borderRadius: "15px",
    border: "1px solid #333333",
    backgroundColor: "#333333",
    color: "#ffffff",
    fontSize: "11px",
    fontWeight: "bold",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.2s"
  },
  menuList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  menuCard: {
    display: "flex",
    backgroundColor: "#ffffff",
    borderRadius: "10px",
    padding: "14px",
    border: "1px solid #f0efeb",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02)",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "15px"
  },
  itemMeta: {
    flex: 1
  },
  vegIndicator: {
    width: "16px",
    height: "16px",
    border: "1px solid #dddddd",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "6px",
    padding: "2px"
  },
  itemBadge: {
    backgroundColor: "#fff0f0",
    color: "#ff3b30",
    fontSize: "9px",
    fontWeight: "bold",
    padding: "2px 6px",
    borderRadius: "4px",
    display: "inline-block",
    marginBottom: "6px",
    textTransform: "uppercase"
  },
  itemName: {
    margin: "0 0 4px 0",
    fontSize: "15px",
    fontWeight: "bold",
    color: "#222222"
  },
  itemPrice: {
    margin: "0 0 6px 0",
    fontSize: "14px",
    fontWeight: "bold",
    color: "#C9A84C"
  },
  itemDesc: {
    margin: 0,
    fontSize: "12px",
    color: "#777777",
    lineHeight: "1.4"
  },
  stepperWrapper: {
    minWidth: "85px",
    display: "flex",
    justifyContent: "flex-end"
  },
  addBtn: {
    backgroundColor: "#ffffff",
    color: "#C9A84C",
    border: "1px solid #C9A84C",
    borderRadius: "6px",
    padding: "6px 16px",
    fontSize: "12px",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "all 0.2s"
  },
  stepper: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#C9A84C",
    borderRadius: "6px",
    color: "#ffffff",
    overflow: "hidden"
  },
  stepperBtn: {
    backgroundColor: "transparent",
    border: "none",
    color: "#ffffff",
    width: "28px",
    height: "28px",
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer"
  },
  stepperVal: {
    padding: "0 4px",
    fontSize: "13px",
    fontWeight: "bold",
    minWidth: "16px",
    textAlign: "center"
  },
  floatingCart: {
    position: "fixed",
    bottom: "85px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "calc(100% - 32px)",
    maxWidth: "468px",
    backgroundColor: "#ffffff",
    borderRadius: "10px",
    boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
    border: "1px solid #C9A84C",
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 98,
    cursor: "pointer"
  },
  floatingCartInfo: {
    display: "flex",
    flexDirection: "column"
  },
  floatingCartCount: {
    fontSize: "12px",
    color: "#666666"
  },
  floatingCartTotal: {
    fontSize: "18px",
    fontWeight: "bold",
    color: "#C9A84C"
  },
  floatingCartBtn: {
    backgroundColor: "#C9A84C",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: "bold",
    cursor: "pointer"
  },
  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: "500px",
    height: "65px",
    backgroundColor: "#ffffff",
    borderTop: "1px solid #eeeeee",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    zIndex: 99
  },
  navItem: {
    background: "none",
    border: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    cursor: "pointer",
    color: "#666666",
    padding: "8px 12px",
    transition: "color 0.2s"
  },
  navLabel: {
    fontSize: "10px",
    fontWeight: "500"
  },
  badgeCount: {
    position: "absolute",
    top: "-6px",
    right: "-10px",
    backgroundColor: "#dc3545",
    color: "#ffffff",
    borderRadius: "50%",
    width: "16px",
    height: "16px",
    fontSize: "9px",
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  cartTabWrapper: {
    animation: "fadeIn 0.3s ease-in-out"
  },
  tabHeading: {
    margin: "0 0 16px 0",
    fontSize: "20px",
    fontWeight: "bold",
    color: "#222"
  },
  emptyCartWrapper: {
    textAlign: "center",
    padding: "40px 20px"
  },
  emptyCartIcon: {
    fontSize: "48px",
    marginBottom: "15px"
  },
  emptyCartText: {
    margin: "0 0 6px 0",
    fontSize: "16px",
    fontWeight: "bold",
    color: "#555"
  },
  emptyCartDesc: {
    margin: "0 0 20px 0",
    fontSize: "13px",
    color: "#888"
  },
  viewMenuBtn: {
    backgroundColor: "#C9A84C",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    padding: "10px 20px",
    fontSize: "13px",
    fontWeight: "bold",
    cursor: "pointer"
  },
  cartList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginBottom: "20px"
  },
  cartItemRow: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    padding: "12px",
    border: "1px solid #f0efeb"
  },
  cartItemName: {
    margin: 0,
    fontSize: "14px",
    fontWeight: "bold",
    color: "#333"
  },
  cartItemCategory: {
    fontSize: "9px",
    color: "#999",
    letterSpacing: "0.5px"
  },
  stepperMini: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#f7f6f2",
    borderRadius: "4px",
    border: "1px solid #eaeaea",
    marginRight: "15px"
  },
  stepperBtnMini: {
    backgroundColor: "transparent",
    border: "none",
    width: "24px",
    height: "24px",
    fontSize: "12px",
    fontWeight: "bold",
    cursor: "pointer"
  },
  stepperValMini: {
    fontSize: "11px",
    fontWeight: "bold",
    minWidth: "14px",
    textAlign: "center"
  },
  cartItemPriceCol: {
    fontSize: "14px",
    fontWeight: "bold",
    color: "#333",
    minWidth: "65px",
    textAlign: "right"
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #f0efeb",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "20px"
  },
  summaryCardHeader: {
    margin: "0 0 12px 0",
    fontSize: "14px",
    fontWeight: "bold",
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  customerDetailPill: {
    fontSize: "13px",
    lineHeight: "1.6",
    color: "#333"
  },
  editSessionBtn: {
    backgroundColor: "transparent",
    border: "none",
    color: "#C9A84C",
    fontSize: "12px",
    fontWeight: "bold",
    cursor: "pointer",
    padding: "4px 0",
    marginTop: "6px"
  },
  registerInlineForm: {
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "4px"
  },
  formLabelText: {
    fontSize: "12px",
    fontWeight: "bold",
    color: "#666"
  },
  formTextInput: {
    border: "1px solid #dddddd",
    borderRadius: "6px",
    padding: "8px 12px",
    fontSize: "13px",
    color: "#333",
    outline: "none"
  },
  saveInfoBtn: {
    backgroundColor: "#C9A84C",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    padding: "10px",
    fontSize: "12px",
    fontWeight: "bold",
    cursor: "pointer"
  },
  errorLabel: {
    color: "#dc3545",
    fontSize: "11px",
    margin: 0
  },
  billDetailsCard: {
    backgroundColor: "#fcfbf9",
    border: "1px solid #eaeae5",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "20px"
  },
  billDetailsHeader: {
    margin: "0 0 12px 0",
    fontSize: "14px",
    fontWeight: "bold",
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  billRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "13px",
    color: "#666",
    marginBottom: "6px"
  },
  billHr: {
    border: "none",
    borderTop: "1px solid #eaeae5",
    margin: "12px 0"
  },
  totalOrderSumRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "15px",
    fontWeight: "bold",
    color: "#C9A84C"
  },
  totalBillRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "15px",
    fontWeight: "bold",
    color: "#222"
  },
  orderSubmitBtn: {
    backgroundColor: "#C9A84C",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    width: "100%",
    padding: "14px",
    fontSize: "15px",
    fontWeight: "bold",
    cursor: "pointer"
  },
  orderError: {
    color: "#dc3545",
    fontSize: "12px",
    textAlign: "center",
    marginBottom: "10px"
  },
  historyTabWrapper: {
    animation: "fadeIn 0.3s ease-in-out"
  },
  orderHeaderCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #C9A84C",
    borderRadius: "8px",
    padding: "14px",
    marginBottom: "15px"
  },
  orderHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  orderStatusPill: {
    backgroundColor: "#fff8e6",
    color: "#C9A84C",
    fontSize: "11px",
    fontWeight: "bold",
    padding: "3px 8px",
    borderRadius: "12px",
    border: "1px solid #ffeeba"
  },
  historyCardList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginBottom: "20px"
  },
  historyItemRow: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#ffffff",
    border: "1px solid #f0efeb",
    borderRadius: "8px",
    padding: "12px"
  },
  histItemName: {
    margin: 0,
    fontSize: "14px",
    fontWeight: "bold",
    color: "#333"
  },
  histItemCategory: {
    fontSize: "9px",
    color: "#999",
    letterSpacing: "0.5px"
  },
  histItemQty: {
    fontSize: "12px",
    color: "#666",
    marginRight: "20px"
  },
  histItemPrice: {
    fontSize: "14px",
    fontWeight: "bold",
    color: "#333",
    minWidth: "65px",
    textAlign: "right"
  },
  billWarningPill: {
    backgroundColor: "#f8f9fa",
    color: "#666666",
    fontSize: "11px",
    fontStyle: "italic",
    padding: "10px 14px",
    borderRadius: "6px",
    textAlign: "center",
    border: "1px solid #eaeaea",
    lineHeight: "1.4"
  },
  modalBackdrop: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 100
  },
  modalContent: {
    width: "100%",
    maxWidth: "500px",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: "16px",
    borderTopRightRadius: "16px",
    padding: "20px",
    boxShadow: "0 -10px 25px rgba(0, 0, 0, 0.1)"
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px"
  },
  modalTitle: {
    margin: 0,
    fontSize: "16px",
    fontWeight: "bold",
    color: "#333"
  },
  closeModalBtn: {
    background: "none",
    border: "none",
    fontSize: "24px",
    cursor: "pointer",
    color: "#999"
  },
  modalDesc: {
    fontSize: "12px",
    color: "#666",
    margin: "0 0 20px 0",
    lineHeight: "1.4"
  },
  modalForm: {
    display: "flex",
    flexDirection: "column",
    gap: "15px"
  },
  modalSubmitBtn: {
    backgroundColor: "#C9A84C",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    padding: "12px",
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer",
    marginTop: "10px"
  },
  successOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 101,
    padding: "20px"
  },
  successOverlayCard: {
    textAlign: "center"
  },
  checkCircle: {
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    backgroundColor: "#28a745",
    color: "#ffffff",
    fontSize: "30px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 20px auto"
  },
  successTitleText: {
    margin: "0 0 10px 0",
    fontSize: "20px",
    fontWeight: "bold",
    color: "#333"
  },
  successBodyText: {
    margin: 0,
    fontSize: "14px",
    color: "#666",
    lineHeight: "1.5"
  },
  loadingWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "60px 0"
  },
  spinner: {
    width: "28px",
    height: "28px",
    border: "3px solid rgba(201, 168, 76, 0.15)",
    borderTop: "3px solid #C9A84C",
    borderRadius: "50%",
    animation: "spin 1s infinite linear"
  },
  loadingText: {
    fontSize: "13px",
    color: "#C9A84C",
    marginTop: "12px"
  },
  emptyWrapper: {
    textAlign: "center",
    padding: "40px 0"
  },
  emptyText: {
    fontSize: "14px",
    color: "#888888"
  },
  legendContainer: {
    display: "flex",
    gap: "20px",
    justifyContent: "center",
    alignItems: "center",
    padding: "10px 14px",
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    border: "1px solid #f0efeb",
    marginBottom: "16px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02)"
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px"
  },
  legendVegIndicator: {
    width: "14px",
    height: "14px",
    border: "1px solid #dddddd",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px"
  },
  legendText: {
    fontSize: "12px",
    fontWeight: "bold",
    color: "#555555"
  }
};

export default function MobileMenuPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "#f7f6f2", color: "#C9A84C" }}>
        <p>Loading table menu...</p>
      </div>
    }>
      <MenuContent />
    </Suspense>
  );
}
