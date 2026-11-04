"use client";
import { useEffect } from "react";

export default function Lightbox({ isOpen, type, src, caption, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div id="lb" className="on" onClick={onClose} role="dialog" aria-modal="true" tabIndex={-1}>
      <div className="lb-box" onClick={(e) => e.stopPropagation()}>
        <button className="lb-close" onClick={onClose} aria-label="Close lightbox">
          ✕ <span>Close</span>
        </button>
        <div id="lbContent">
          {type === "i" ? (
            <img
              src={src}
              alt={caption}
              style={{ width: "100%", maxHeight: "84vh", objectFit: "contain" }}
            />
          ) : (
            <video
              controls
              autoPlay
              playsInline
              style={{ width: "100%", maxHeight: "82vh" }}
            >
              <source src={src} type="video/mp4" />
              Your browser does not support video.
            </video>
          )}
        </div>
        <p id="lbCap" className="lb-cap">
          {caption}
        </p>
      </div>
    </div>
  );
}
