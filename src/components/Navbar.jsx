"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import Link from "next/link";

export default function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  const [isPinned, setIsPinned] = useState(false);
  const [isMobOpen, setIsMobOpen] = useState(false);

  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setIsPinned(window.scrollY > 60);
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (totalScroll > 0) {
        setScrollProgress((window.scrollY / totalScroll) * 100);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const getLink = (hash) => {
    return `/${hash.replace("#", "")}`;
  };

  const openMob = () => {
    setIsMobOpen(true);
    document.body.style.overflow = "hidden";
  };

  const closeMob = () => {
    setIsMobOpen(false);
    document.body.style.overflow = "";
  };

  return (
    <>
      {/* Accessibility Link */}
      <a
        href="#main"
        style={{
          position: "fixed",
          top: "-100%",
          left: "1rem",
          zIndex: 9999,
          background: "var(--g1)",
          color: "var(--bg0)",
          padding: ".5rem 1rem",
          fontFamily: "'Josefin Sans', sans-serif",
          fontSize: ".7rem",
          letterSpacing: ".2em",
          textTransform: "uppercase",
          transition: "top .2s",
        }}
        onFocus={(e) => (e.target.style.top = "1rem")}
        onBlur={(e) => (e.target.style.top = "-100%")}
      >
        Skip to Content
      </a>

      {/* Mobile Navigation Drawer */}
      <nav
        id="mobNav"
        className={isMobOpen ? "open" : ""}
        aria-label="Mobile navigation"
        role="navigation"
      >
        <div className="mob-nav-header">
          <div className="mob-brand-monogram">HUMTUM</div>
          <button className="mob-x" onClick={closeMob} aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="mob-links-container">
          <Link href={getLink("#about")} onClick={closeMob} className="mob-link">
            <span className="mob-link-num">01</span>
            <span className="mob-link-text">Story</span>
          </Link>
          <Link href={getLink("#menu")} onClick={closeMob} className="mob-link">
            <span className="mob-link-num">02</span>
            <span className="mob-link-text">Menu</span>
          </Link>
          <Link href={getLink("#bar")} onClick={closeMob} className="mob-link">
            <span className="mob-link-num">03</span>
            <span className="mob-link-text">Bar</span>
          </Link>
          <Link href={getLink("#events")} onClick={closeMob} className="mob-link">
            <span className="mob-link-num">04</span>
            <span className="mob-link-text">Events</span>
          </Link>
          <Link href={getLink("#contact")} onClick={closeMob} className="mob-link">
            <span className="mob-link-num">05</span>
            <span className="mob-link-text">Contact</span>
          </Link>
        </div>

        <div className="mob-nav-footer">
          <Link href={getLink("#reserve")} onClick={closeMob} className="mob-reserve-btn">
            <span>Reserve a Table</span>
          </Link>
          <div className="mob-contact-info">
            <a href="tel:+918896743602" className="mob-info-link">+91 88967 43602</a>
            <div className="mob-socials">
              <a href="https://www.instagram.com/humtum.thebar" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
              </a>
              <span className="sep">◆</span>
              <a href="https://www.facebook.com/humtum.thebar" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Header Bar */}
      <header>
        <div 
          className="scroll-progress-bar" 
          style={{ 
            position: "fixed", 
            top: 0, 
            left: 0, 
            height: "3px", 
            background: "var(--grd)", 
            width: `${scrollProgress}%`, 
            zIndex: 9999,
            transition: "width 0.1s ease-out"
          }} 
        />
        <nav
          id="nav"
          className={isPinned ? "pinned" : ""}
          role="navigation"
          aria-label="Main navigation"
        >
          <Link href="/" aria-label="HUMTUM The BAR & Restaurant">
            <Image
              src="/logo.webp"
              alt="HUMTUM The BAR & Restaurant"
              width={220}
              height={76}
              className="n-logo"
              style={{ width: "auto" }}
              priority
            />
          </Link>

          <ul className="n-links" role="list">
            <li><Link href={getLink("#about")}>Story</Link></li>
            <li><Link href={getLink("#menu")}>Menu</Link></li>
            <li><Link href={getLink("#bar")}>Bar</Link></li>
            <li><Link href={getLink("#events")}>Events</Link></li>
            <li><Link href={getLink("#contact")}>Contact</Link></li>
          </ul>

          <div style={{ display: "flex", alignItems: "center", gap: "1.2rem" }}>
            <Link href={getLink("#reserve")} className="n-cta">
              <span>Reserve a Table</span>
            </Link>
            <button
              className="n-burger"
              onClick={openMob}
              aria-label="Open menu"
              aria-expanded={isMobOpen}
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        </nav>
      </header>
    </>
  );
}
