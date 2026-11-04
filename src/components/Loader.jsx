"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

export default function Loader() {
  const [isOut, setIsOut] = useState(false);
  const [isMounted, setIsMounted] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsOut(true), 2100);
    const unmountTimer = setTimeout(() => setIsMounted(false), 3100); // 2.1s delay + 1s fade-out duration
    return () => {
      clearTimeout(timer);
      clearTimeout(unmountTimer);
    };
  }, []);

  if (!isMounted) return null;

  return (
    <div id="loader" className={isOut ? "out" : ""} role="status" aria-label="Loading">
      <Image
        src="/logo.webp"
        alt="Humtum Logo"
        width={96}
        height={96}
        className="ld-logo"
        style={{ width: "auto" }}
        priority
      />
      <div className="ld-progress"></div>
      <div className="ld-label">Humtum Gorakhpur</div>
    </div>
  );
}
