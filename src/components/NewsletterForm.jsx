"use client";
import { useState } from "react";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: "", message: "" });

    const trimmedEmail = email.trim();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!trimmedEmail) {
      setStatus({ type: "err", message: "Please enter your email address." });
      setIsSubmitting(false);
      return;
    }

    if (!emailRegex.test(trimmedEmail)) {
      setStatus({ type: "err", message: "Please enter a valid email address." });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const resData = await response.json();

      if (response.ok && resData.success) {
        setStatus({ type: "ok", message: `✦ ${resData.message}` });
        setEmail("");
      } else {
        setStatus({ type: "err", message: resData.error || "Could not subscribe. Please try again." });
      }
    } catch (error) {
      setStatus({ type: "err", message: "Could not subscribe. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="nl-form-container">
      <form className="nl-form-wrap" id="nlForm" onSubmit={handleSubmit} noValidate>
        <input
          className="nl-in"
          name="email"
          type="email"
          placeholder="Your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-label="Email for newsletter"
          disabled={isSubmitting}
        />
        <button type="submit" className="nl-btn" disabled={isSubmitting}>
          {isSubmitting ? "..." : "Subscribe"}
        </button>
      </form>
      <p className={`nl-msg ${status.type === "err" ? "err" : ""}`} id="nlMsg" role="status" aria-live="polite">
        {status.message}
      </p>
    </div>
  );
}
