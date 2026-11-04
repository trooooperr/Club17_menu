"use client";

const GALLERY_IMAGES = [
  {
    type: "i",
    full: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1400&q=90",
    thumb: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=80&auto=format&fit=crop",
    caption: "Fine Dining at Humtum",
    alt: "Fine dining at Humtum restaurant Gorakhpur",
    label: "Fine Dining",
  },
  {
    type: "i",
    full: "https://images.unsplash.com/photo-1574096079513-d8259312b785?w=1200&q=90",
    thumb: "https://images.unsplash.com/photo-1574096079513-d8259312b785?w=600&q=80&auto=format&fit=crop",
    caption: "The Bar",
    alt: "Humtum craft cocktail bar",
    label: "The Bar",
  },
  {
    type: "i",
    full: "https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=1200&q=90",
    thumb: "https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=600&q=80&auto=format&fit=crop",
    caption: "Open Kitchen",
    alt: "Open kitchen at Humtum",
    label: "Open Kitchen",
  },
  {
    type: "i",
    full: "https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=1200&q=90",
    thumb: "https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=600&q=80&auto=format&fit=crop",
    caption: "Artisan Plates",
    alt: "Artisan plated cuisine at Humtum",
    label: "Artisan Plates",
  },
  {
    type: "i",
    full: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200&q=90",
    thumb: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&q=80&auto=format&fit=crop",
    caption: "The Lounge",
    alt: "Lounge area at Humtum Gorakhpur",
    label: "The Lounge",
  },
];

export default function GalleryMosaic({ onOpenLightbox }) {
  const handleKeyDown = (e, item) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpenLightbox(item.type, item.full, item.caption);
    }
  };

  return (
    <div className="gallery-mosaic" aria-label="Restaurant photo gallery" role="region">
      {GALLERY_IMAGES.map((item, index) => (
        <div
          key={index}
          className="gm-cell"
          onClick={() => onOpenLightbox(item.type, item.full, item.caption)}
          onKeyDown={(e) => handleKeyDown(e, item)}
          role="button"
          tabIndex={0}
          aria-label={`View ${item.label.toLowerCase()} photo`}
        >
          <img src={item.thumb} alt={item.alt} loading="lazy" />
          <div className="gm-lbl">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
