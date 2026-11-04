"use client";

const PAST_EVENTS = [
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
  },
];

export default function PastEvents({ onOpenLightbox, events = [] }) {
  const displayEvents = events.length > 0 ? events : PAST_EVENTS;

  const handleKeyDown = (e, item) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpenLightbox(item.type, item.full, item.caption || `${item.title} - ${item.desc}`);
    }
  };

  return (
    <div className="pe-grid stagger">
      {displayEvents.map((item, index) => (
        <article
          key={item._id || index}
          className="pe-card"
          onClick={() => onOpenLightbox(item.type, item.full, item.caption || `${item.title} - ${item.desc}`)}
          onKeyDown={(e) => handleKeyDown(e, item)}
          role="button"
          tabIndex={0}
          aria-label={`Watch ${item.title} ${item.type === "v" ? "video" : "photo"}`}
        >
          <div className="pe-thumb">
            <img src={item.thumb} alt={item.alt || item.title} loading="lazy" />
            <div className="pe-badge" aria-label={item.type === "v" ? "Video content" : "Photo content"}>
              {item.type === "v" ? "Video" : "Photo"}
            </div>
            {item.type === "v" && (
              <div className="pe-play" aria-hidden="true">
                <svg viewBox="0 0 60 60" fill="none" aria-hidden="true">
                  <circle cx="30" cy="30" r="29" stroke="#C9A84C" strokeWidth="1.5" />
                  <polygon points="25,18 45,30 25,42" fill="#C9A84C" />
                </svg>
              </div>
            )}
          </div>
          <div className="pe-body">
            <div className="pe-meta">
              <time dateTime={item.date.split(" ").reverse().join("-")}>{item.date}</time> · {item.category}
            </div>
            <h3 className="pe-title">{item.title}</h3>
            <p className="pe-desc">{item.desc}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
