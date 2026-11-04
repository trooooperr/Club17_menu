"use client";
import { useState, useEffect } from "react";

export default function ReservationForm() {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    guests: "",
    date: "",
    time: "",
    occasion: "",
    message: "",
    diningArea: "Main Room",
  });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Custom picker states
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Generate 30-min time slots from 12:00 PM to 11:30 PM (restaurant hours)
  const timeSlots = [];
  const hoursList = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  hoursList.forEach((h) => {
    [0, 30].forEach((m) => {
      const ampm = h >= 12 ? "PM" : "AM";
      const displayHour = h % 12 === 0 ? 12 : h % 12;
      const displayMin = String(m).padStart(2, "0");
      timeSlots.push(`${displayHour}:${displayMin} ${ampm}`);
    });
  });

  // Close custom pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest(".input-group")) {
        setShowCalendar(false);
        setShowTimePicker(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    return new Date(year, month, 1).getDay();
  };

  const isPastDate = (day) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
    return checkDate < today;
  };

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  };

  const handleSelectDay = (day) => {
    const year = calendarDate.getFullYear();
    const month = String(calendarDate.getMonth() + 1).padStart(2, "0");
    const dayStr = String(day).padStart(2, "0");
    const selectedDateStr = `${year}-${month}-${dayStr}`;
    setFormData((prev) => ({ ...prev, date: selectedDateStr }));
    setShowCalendar(false);
  };

  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  };

  const selectDiningArea = (area) => {
    setFormData((prev) => ({ ...prev, diningArea: area }));
  };

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
    const guests = formData.guests;
    const date = formData.date;
    const time = formData.time;
    const occasion = formData.occasion;
    const message = formData.message.trim();
    const diningArea = formData.diningArea;

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

    if (!phone) {
      setStatus({ type: "err", message: "Phone number is required." });
      setIsSubmitting(false);
      return;
    }

    if (!phoneRegex.test(phone)) {
      setStatus({ type: "err", message: "Please enter a valid phone number (at least 10 digits)." });
      setIsSubmitting(false);
      return;
    }

    if (email && !emailRegex.test(email)) {
      setStatus({ type: "err", message: "Please enter a valid email address." });
      setIsSubmitting(false);
      return;
    }

    const guestsNum = parseInt(guests);
    if (!guests || isNaN(guestsNum) || guestsNum < 1 || guestsNum > 50) {
      setStatus({ type: "err", message: "Please enter a valid number of guests (1-50)." });
      setIsSubmitting(false);
      return;
    }

    if (!date) {
      setStatus({ type: "err", message: "Please select a reservation date." });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, guests: guestsNum, date, time, occasion, message, diningArea }),
      });

      const resData = await response.json();

      if (response.ok && resData.success) {
        setStatus({ type: "ok", message: `✦ ${resData.message}` });
        setFormData({
          name: "",
          phone: "",
          email: "",
          guests: "",
          date: "",
          time: "",
          occasion: "",
          message: "",
          diningArea: "Main Room",
        });
      } else {
        setStatus({ type: "err", message: resData.error || "Something went wrong. Please try again." });
      }
    } catch (error) {
      setStatus({ type: "err", message: "Unable to connect. Please call us at +91 88967 43602." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(calendarDate.getMonth(), calendarDate.getFullYear());
    const firstDay = getFirstDayOfMonth(calendarDate.getMonth(), calendarDate.getFullYear());
    const days = [];

    const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="cal-day-empty"></div>);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const year = calendarDate.getFullYear();
      const month = String(calendarDate.getMonth() + 1).padStart(2, "0");
      const dayStr = String(d).padStart(2, "0");
      const checkStr = `${year}-${month}-${dayStr}`;
      const isSelected = formData.date === checkStr;
      const disabled = isPastDate(d);

      days.push(
        <button
          key={`day-${d}`}
          type="button"
          disabled={disabled}
          className={`cal-day ${isSelected ? "selected" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            handleSelectDay(d);
          }}
        >
          {d}
        </button>
      );
    }

    return (
      <div className="custom-picker-dropdown" onClick={(e) => e.stopPropagation()}>
        <div className="cal-header">
          <button type="button" className="cal-btn" onClick={handlePrevMonth}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <span className="cal-title">
            {monthNames[calendarDate.getMonth()]} {calendarDate.getFullYear()}
          </span>
          <button type="button" className="cal-btn" onClick={handleNextMonth}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
        <div className="cal-grid">
          {weekdays.map((w) => (
            <div key={w} className="cal-weekday">{w}</div>
          ))}
          {days}
        </div>
      </div>
    );
  };

  const renderTimePicker = () => {
    return (
      <div className="custom-picker-dropdown" onClick={(e) => e.stopPropagation()}>
        <div className="cal-header" style={{ marginBottom: "0.8rem" }}>
          <span className="cal-title">Select Time</span>
        </div>
        <div className="time-picker-grid">
          {timeSlots.map((slot) => {
            const isSelected = formData.time === slot;
            return (
              <button
                key={slot}
                type="button"
                className={`time-slot-btn ${isSelected ? "selected" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setFormData((prev) => ({ ...prev, time: slot }));
                  setShowTimePicker(false);
                }}
              >
                {slot}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <form id="resForm" onSubmit={handleSubmit} noValidate>
      <div className="seating-selector rv">
        <label className="res-title">Preferred Seating Area *</label>
        <div className="seating-grid">
          <button
            type="button"
            className={`seating-card ${formData.diningArea === "Main Room" ? "active" : ""}`}
            onClick={() => selectDiningArea("Main Room")}
          >
            <div className="sc-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="sc-svg-ic">
                <path d="M3 2v7c0 1.1.9 2 2 2h1a2 2 0 0 0 2-2V2"/>
                <path d="M5 2v4"/>
                <path d="M6 11v11"/>
                <path d="M19 22V2c0 2-3 2-3 6v14"/>
                <path d="M12 6v12"/>
              </svg>
            </div>
            <div className="sc-meta">
              <span className="sc-name">Main Room</span>
              <span className="sc-desc">Fine Dining</span>
            </div>
          </button>

          <button
            type="button"
            className={`seating-card ${formData.diningArea === "The Lounge" ? "active" : ""}`}
            onClick={() => selectDiningArea("The Lounge")}
          >
            <div className="sc-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="sc-svg-ic">
                <path d="M5 2h14l-7 9-7-9z"/>
                <path d="M12 11v9"/>
                <path d="M8 22h8"/>
                <path d="M11 6l1.5-1.5"/>
              </svg>
            </div>
            <div className="sc-meta">
              <span className="sc-name">The Lounge</span>
              <span className="sc-desc">Vibrant Bar</span>
            </div>
          </button>

          <button
            type="button"
            className={`seating-card ${formData.diningArea === "VIP Table" ? "active" : ""}`}
            onClick={() => selectDiningArea("VIP Table")}
          >
            <div className="sc-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="sc-svg-ic">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </div>
            <div className="sc-meta">
              <span className="sc-name">VIP Table</span>
              <span className="sc-desc">Premium Seating</span>
            </div>
          </button>
        </div>
      </div>
      <div className="res-grid rv">
        <div className="input-group">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="input-icon">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <input
            className="ri"
            name="name"
            type="text"
            placeholder="Full Name *"
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
            placeholder="Phone Number *"
            value={formData.phone}
            onChange={handleChange}
            required
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
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <input
            className="ri"
            name="guests"
            type="number"
            placeholder="No. of Guests *"
            min="1"
            max="50"
            value={formData.guests}
            onChange={handleChange}
            required
            disabled={isSubmitting}
          />
        </div>
      </div>
      <div className="res-row2 rv">
        <div
          className="input-group"
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            setShowCalendar(!showCalendar);
            setShowTimePicker(false);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="input-icon">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <input
            className="ri"
            name="date"
            type="text"
            readOnly
            value={formData.date ? formatDateForDisplay(formData.date) : ""}
            placeholder="Select Date *"
            disabled={isSubmitting}
            style={{ cursor: "pointer" }}
          />
          {showCalendar && renderCalendar()}
        </div>
        <div
          className="input-group"
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            setShowTimePicker(!showTimePicker);
            setShowCalendar(false);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="input-icon">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <input
            className="ri"
            name="time"
            type="text"
            readOnly
            value={formData.time}
            placeholder="Select Time"
            disabled={isSubmitting}
            style={{ cursor: "pointer" }}
          />
          {showTimePicker && renderTimePicker()}
        </div>
        <div className="input-group">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="input-icon">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          <select
            className="ri"
            name="occasion"
            value={formData.occasion}
            onChange={handleChange}
            disabled={isSubmitting}
          >
            <option value="">Occasion (optional)</option>
            <option value="Birthday">Birthday</option>
            <option value="Anniversary">Anniversary</option>
            <option value="Date Night">Date Night</option>
            <option value="Business Dinner">Business Dinner</option>
            <option value="Family Gathering">Family Gathering</option>
            <option value="Private Party">Private Party</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <button type="submit" className="btn-res" id="resBtn" disabled={isSubmitting}>
          {isSubmitting ? "Sending..." : "Confirm Reservation"}
        </button>
      </div>
      <div className="res-row3 rv">
        <div className="input-group textarea-group">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="input-icon textarea-icon">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <textarea
            className="ri area"
            name="message"
            placeholder="Special requests, dietary requirements, or any message for our team..."
            value={formData.message}
            onChange={handleChange}
            aria-label="Special requests"
            disabled={isSubmitting}
          ></textarea>
        </div>
      </div>
      <p className={`form-msg ${status.type}`} id="resMsg" role="status" aria-live="polite">
        {status.message}
      </p>
    </form>
  );
}
