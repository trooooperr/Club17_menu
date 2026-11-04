import { Event, MenuItem } from "./db";

export const DEFAULT_EVENTS = [
  {
    type: "i",
    full: "/uploads/events/bolly-retro-night.jpg",
    thumb: "/uploads/events/bolly-retro-night.jpg",
    caption: "Bolly Retro Night — Music by DJ Anuj & Two Female Dancers",
    alt: "Bolly Retro Night event poster at Humtum Gorakhpur",
    date: "16 Aug 2026",
    category: "Retro Night",
    title: "Bolly Retro Night",
    desc: "Live the weekend only at Humtum! Bollywood Classics, Retro Vibes & Timeless Hits featuring DJ Anuj & Two Female Dancers. Grace, Energy, Performance all night long.",
    isUpcoming: true,
  },
  {
    type: "i",
    full: "/uploads/events/friendship-night.jpg",
    thumb: "/uploads/events/friendship-night.jpg",
    caption: "Friendship Night — Music by DJ Marcus",
    alt: "Friendship Night event poster at Humtum Gorakhpur",
    date: "02 Aug 2026",
    category: "Celebration",
    title: "Friendship Night",
    desc: "It's a celebration of friendship! Live DJ performance by DJ Marcus with club hits all night, dance floor & beer offer buy 5 get 1 free.",
    isUpcoming: false,
  },
  {
    type: "i",
    full: "/uploads/events/saturday-night.jpg",
    thumb: "/uploads/events/saturday-night.jpg",
    caption: "Saturday Night — Music by DJ Marcus",
    alt: "Saturday Night event poster at Humtum Gorakhpur",
    date: "01 Aug 2026",
    category: "DJ Night",
    title: "Saturday Night",
    desc: "Dance, Music, Food & Drinks. Featuring high-energy club hits all night by DJ Marcus.",
    isUpcoming: false,
  },
  {
    type: "i",
    full: "/uploads/events/bollywood-night.jpg",
    thumb: "/uploads/events/bollywood-night.jpg",
    caption: "Bollywood Night — Music by DJ Anuj",
    alt: "Bollywood Night event poster at Humtum Gorakhpur",
    date: "25 Jul 2026",
    category: "Bollywood Night",
    title: "Bollywood Night",
    desc: "Saturday nights are for legends! Featuring Bollywood hits all night by DJ Anuj.",
    isUpcoming: false,
  },
];

export const DEFAULT_MENU = {
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
  drinks: [
    { name: "Johnnie Walker Gold Label", desc: "Rich blended Scotch whisky with luxurious honey & vanilla notes", tag: "Gold Reserve", badge: "Alcoholic" },
    { name: "Grey Goose Vodka", desc: "Super-premium French winter wheat vodka served chilled", tag: "Premium Vodka", badge: "Alcoholic" },
    { name: "Bombay Sapphire Gin", desc: "Vapour-infused London dry gin with 10 botanical notes", tag: "Dry Gin", badge: "Alcoholic" },
    { name: "Jagermeister Liqueur", desc: "Legendary German herbal liqueur crafted from 56 botanicals", tag: "Herbal Shot", badge: "Alcoholic" },
    { name: "Black & White Celebration", desc: "Classic Scotch whisky with balanced malt sweetness & subtle smoke", tag: "Scotch Whisky", badge: "Alcoholic" },
    { name: "Smirnoff Minty Jamun", desc: "Refreshing Indian jamun fruit infused triple distilled vodka", tag: "Flavored Vodka", badge: "Alcoholic" },
  ],
};

export async function seedEventsIfNeeded() {
  const currentEvents = await Event.find({});
  const hasOldEvents = currentEvents.some(e => !e.full || e.full.includes("unsplash") || e.full.endsWith(".png"));
  if (currentEvents.length === 0 || hasOldEvents || currentEvents.length < 4) {
    await Event.deleteMany({});
    await Event.insertMany(DEFAULT_EVENTS);
    console.log("Seeded 4 default square poster events successfully.");
    return true;
  }
  return false;
}

export async function seedMenuItemsIfNeeded() {
  // Migrate legacy categories
  await MenuItem.updateMany({ category: "desserts" }, { $set: { category: "bar_bites" } });
  await MenuItem.updateMany({ category: "mains" }, { $set: { category: "main_course" } });

  // Sanitize drink names in DB to strip (30ml)
  const drinksWith30ml = await MenuItem.find({ name: /30\s*ml/i });
  for (const drink of drinksWith30ml) {
    const cleanName = drink.name.replace(/\s*\(\s*30\s*ml\s*\)/gi, "").trim();
    await MenuItem.updateOne({ _id: drink._id }, { $set: { name: cleanName } });
  }

  const count = await MenuItem.countDocuments();
  if (count === 0 || count !== 24) {
    // Replace with clean 6-item menu per section
    await MenuItem.deleteMany({});
    const seedData = [];
    Object.keys(DEFAULT_MENU).forEach((category) => {
      DEFAULT_MENU[category].forEach((item) => {
        seedData.push({
          name: item.name,
          desc: item.desc,
          price: "",
          tag: item.tag || "",
          badge: item.badge || "",
          category: category,
        });
      });
    });
    await MenuItem.insertMany(seedData);
    console.log("Seeded clean 6-item default menu items successfully.");
    return true;
  }
  return false;
}
