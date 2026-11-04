"use client";
import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const POS_SOCKET_URL = process.env.NEXT_PUBLIC_POS_SOCKET_URL || (typeof window !== "undefined" ? window.location.origin : "https://humtumbar.in");

const DEFAULT_MENU_ITEMS = {
  starters: [
    { name: "Chilli Paneer Dry", desc: "Tender cottage cheese cubes tossed with bell peppers, onions & spicy chili sauce", tag: "Popular", badge: "Veg" },
    { name: "Veg Spring Roll", desc: "Crispy golden rolls stuffed with shredded fresh vegetables & light Asian spices", tag: "Classic", badge: "Veg" },
    { name: "Crispy Corn", desc: "Golden sweet corn kernels fried crispy with green chilies & spring onion", tag: "Bestseller", badge: "Veg" },
    { name: "Chicken Popcorn", desc: "Bite-sized tender chicken fried golden & crisp with secret house spice blend", tag: "Crispy Pick", badge: "Non-Veg" },
    { name: "Chicken 65", desc: "Fiery South-Indian style deep-fried chicken tossed with curry leaves & green chilies", tag: "Spicy Favorite", badge: "Non-Veg" },
    { name: "Chicken Lollipop", desc: "Crispy fried chicken wings shaped like lollipops tossed in hot garlic soy sauce", tag: "Chef's Special", badge: "Non-Veg" },
  ],
  bar_bites: [
    { name: "Aloo Chaat", desc: "Spiced tangy potatoes tossed with roasted cumin, green chutney & pomegranate", tag: "Street Special", badge: "Veg" },
    { name: "Peanut Masala", desc: "Roasted peanuts tossed with crunchy onions, tomatoes, green chilies & fresh lemon", tag: "Bar Classic", badge: "Veg" },
    { name: "French Fries", desc: "Classic golden crispy salted french fries served with house dip", tag: "Favorite", badge: "Veg" },
    { name: "Peri Peri Fries", desc: "Golden fries tossed in fiery peri peri spice seasoning", tag: "Spicy Pick", badge: "Veg" },
    { name: "Paneer Cutlet", desc: "Golden spiced cottage cheese cutlets served with tangy mint chutney", tag: "Chef's Pick", badge: "Veg" },
    { name: "Paneer Pakoda", desc: "Crispy chickpea-battered cottage cheese fritters sprinkled with chaat masala", tag: "Crispy", badge: "Veg" },
  ],
  main_course: [
    { name: "Paneer Butter Masala", desc: "Rich creamy tomato cashew gravy with succulent paneer cubes & fenugreek", tag: "Popular", badge: "Veg" },
    { name: "Kadhai Paneer", desc: "Cottage cheese tossed with bell peppers, onion & freshly pounded kadhai spices", tag: "Spicy Classic", badge: "Veg" },
    { name: "Paneer Lababdar", desc: "Soft cottage cheese in rich tomato-onion masala gravy finished with butter & cream", tag: "Chef's Special", badge: "Veg" },
    { name: "Butter Chicken", desc: "Tender tandoori chicken cooked in iconic velvet butter makhani gravy", tag: "Signature", badge: "Non-Veg" },
    { name: "Chicken Rara", desc: "Minced chicken & tender chicken pieces slow-cooked in rich aromatic gravy", tag: "Royal Feast", badge: "Non-Veg" },
    { name: "Kadhai Chicken", desc: "Juicy chicken pieces tossed with bell peppers, onion & kadhai spice reduction", tag: "Spicy Pick", badge: "Non-Veg" },
  ],
};

export default function MenuSection() {
  const [menuItems, setMenuItems] = useState(DEFAULT_MENU_ITEMS);
  const [activeTab, setActiveTab] = useState("starters");
  const gridRef = useRef(null);

  const fetchMenu = async () => {
    try {
      const res = await fetch(`/api/menu/website?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success && data.menuItems) {
        const starters = data.menuItems.filter((item) => {
          const cat = (item.category || "").toLowerCase();
          return cat.includes("starter");
        });
        const barBites = data.menuItems.filter((item) => {
          const cat = (item.category || "").toLowerCase();
          return cat.includes("bar_bites") || cat.includes("bar bites") || cat.includes("dessert");
        });
        const mainCourse = data.menuItems.filter((item) => {
          const cat = (item.category || "").toLowerCase();
          return cat.includes("main_course") || cat.includes("main course") || cat.includes("main");
        });

        // Only update if we actually got items back to prevent blank screens
        if (starters.length > 0 || barBites.length > 0 || mainCourse.length > 0) {
          setMenuItems({
            starters: starters.length > 0 ? starters : DEFAULT_MENU_ITEMS.starters,
            bar_bites: barBites.length > 0 ? barBites : DEFAULT_MENU_ITEMS.bar_bites,
            main_course: mainCourse.length > 0 ? mainCourse : DEFAULT_MENU_ITEMS.main_course,
          });
        }
      }
    } catch (err) {
      console.error("Failed to load homepage menu:", err);
    }
  };

  useEffect(() => {
    fetchMenu();

    const socket = io(POS_SOCKET_URL, {
      transports: ["websocket"]
    });

    socket.on("connect", () => {
      console.log("MenuSection connected to Socket.IO");
    });

    socket.on("REFRESH_MENU", () => {
      console.log("MenuSection received REFRESH_MENU broadcast");
      fetchMenu();
    });

    // Fallback poll every 10 minutes as a backup in case WebSocket disconnects
    const interval = setInterval(() => {
      fetchMenu();
    }, 600000);

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, []);

  // Re-trigger reveal animations when switching tab
  useEffect(() => {
    const grid = gridRef.current;
    if (grid) {
      grid.classList.remove("in");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          grid.classList.add("in");
        });
      });
    }
  }, [activeTab]);

  return (
    <section className="sec" id="menu" aria-labelledby="menu-h2">
      <div className="menu-sec">
        <div className="ctr rv" style={{ marginBottom: "3.5rem" }}>
          <div className="tag">Culinary Journey</div>
          <h2 className="sh" id="menu-h2">
            Crafted with <em>Intention</em>
          </h2>
          <p className="sb" style={{ maxWidth: "54ch", margin: "1.2rem auto 0" }}>
            A menu that journeys from the tandoors of North India to modern European technique — unified by one philosophy: uncompromising excellence.
          </p>
        </div>

        {/* Tab Selection */}
        <div className="m-tabs" role="tablist" aria-label="Menu categories">
          {Object.keys(menuItems).map((key) => {
            const label = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
            return (
              <button
                key={key}
                className={`m-tab ${activeTab === key ? "on" : ""}`}
                role="tab"
                aria-selected={activeTab === key}
                aria-controls={`mt-${key}`}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            );
          })}
          <a href="/menu" className="m-tab" role="link">
            All
          </a>
        </div>

        {/* Grid List */}
        <div
          ref={gridRef}
          className="m-grid on stagger in"
          id={`mt-${activeTab}`}
          role="tabpanel"
          aria-label={`${activeTab} menu`}
        >
          {menuItems[activeTab] && menuItems[activeTab].map((item, index) => (
            <article className="mc" key={item._id || index}>
              <div className="mc-tag">{item.tag}</div>
              <h3 className="mc-name">{item.name}</h3>
              <p className="mc-desc">{item.desc}</p>
              {item.badge && (
                <div className="mc-price" style={{ justifyContent: "flex-end" }}>
                  <span className="mc-badge">{item.badge}</span>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
