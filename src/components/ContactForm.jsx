"use client";
import { useState } from "react";

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    subject: "",
    message: "",
  });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: "", message: "" });

    const name = formData.name.trim();
    const phone = formData.phone.trim();
    const email = formData.email.trim();
    const subject = formData.subject.trim();
    const message = formData.message.trim();

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const phoneRegex = /^[+]?[0-9\s\-()]{10,20}$/;

    if (!name) {
      setStatus({ type: "err", message: "Name is required." });
      setIsSubmitting(false);
      return;
    }

    if (name.length < 2) {
      setStatus({ type: "err", message: "Name must be at least 2 characters long." });
      setIsSubmitting(false);
      return;
    }

    if (phone && !phoneRegex.test(phone)) {
      setStatus({ type: "err", message: "Please enter a valid phone number (at least 10 digits)." });
      setIsSubmitting(false);
      return;
    }

    if (email && !emailRegex.test(email)) {
      setStatus({ type: "err", message: "Please enter a valid email address." });
      setIsSubmitting(false);
      return;
    }

    if (!message) {
      setStatus({ type: "err", message: "Message is required." });
      setIsSubmitting(false);
      return;
    }

    if (message.length < 10) {
      setStatus({ type: "err", message: "Message must be at least 10 characters long." });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, subject, message }),
      });

      const resData = await response.json();

      if (response.ok && resData.success) {
        setStatus({ type: "ok", message: `✦ ${resData.message}` });
        setFormData({
          name: "",
          phone: "",
          email: "",
          subject: "",
          message: "",
        });
      } else {
        setStatus({ type: "err", message: resData.error || "Something went wrong. Please try again." });
      }
    } catch (error) {
      setStatus({ type: "err", message: "Unable to connect. Please email contact@humtumbar.in." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="ct-form" id="ctForm" onSubmit={handleSubmit} noValidate>
      <div className="input-group">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="input-icon">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <input
          className="ri"
          name="name"
          type="text"
          placeholder="Your Name *"
          value={formData.name}
          onChange={handleChange}
          required
          autoComplete="name"
          disabled={isSubmitting}
        />
      </div>
      <div className="input-group">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="input-icon">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
        <input
          className="ri"
          name="phone"
          type="tel"
          placeholder="Phone Number"
          value={formData.phone}
          onChange={handleChange}
          autoComplete="tel"
          disabled={isSubmitting}
        />
      </div>
      <div className="input-group">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="input-icon">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
        <input
          className="ri"
          name="email"
          type="email"
          placeholder="Email Address"
          value={formData.email}
          onChange={handleChange}
          autoComplete="email"
          disabled={isSubmitting}
        />
      </div>
      <div className="input-group">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="input-icon">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
        <input
          className="ri"
          name="subject"
          type="text"
          placeholder="Subject"
          value={formData.subject}
          onChange={handleChange}
          disabled={isSubmitting}
        />
      </div>
      <div className="input-group textarea-group span-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="input-icon textarea-icon">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <textarea
          className="ri area"
          name="message"
          placeholder="Your message *"
          value={formData.message}
          onChange={handleChange}
          required
          aria-label="Message"
          disabled={isSubmitting}
        ></textarea>
      </div>
      <button type="submit" className="btn-res" id="ctBtn" disabled={isSubmitting}>
        {isSubmitting ? "Sending..." : "Send Message"}
      </button>
      <p className={`form-msg ${status.type}`} id="ctMsg" role="status" aria-live="polite">
        {status.message}
      </p>
    </form>
  );
}
