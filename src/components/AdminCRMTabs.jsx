"use client";

import { useState, useEffect } from "react";

export default function AdminCRMTabs({
  token,
  activeTab,
  campaignsList,
  fetchCampaigns,
  staffUsers,
  loginActivities,
  fetchStaffData,
  crmSettings,
  fetchCrmSettings
}) {
  // Staff forms state
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [staffName, setStaffName] = useState("");
  const [staffUsername, setStaffUsername] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffError, setStaffError] = useState("");
  const [submittingStaff, setSubmittingStaff] = useState(false);

  // Settings local state
  const [localSettings, setLocalSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  
  // PDF uploads state
  const [uploadingFoodPdf, setUploadingFoodPdf] = useState(false);
  const [uploadingBarPdf, setUploadingBarPdf] = useState(false);
  const [pdfFoodUrl, setPdfFoodUrl] = useState("");
  const [pdfBarUrl, setPdfBarUrl] = useState("");

  // Campaign form state
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignContent, setCampaignContent] = useState("");
  const [campaignImageUrl, setCampaignImageUrl] = useState("");
  const [campaignChannels, setCampaignChannels] = useState(["email", "whatsapp"]);
  const [campaignAudience, setCampaignAudience] = useState("all");
  const [campaignType, setCampaignType] = useState("custom");
  const [campaignStatus, setCampaignStatus] = useState("sent");
  const [campaignScheduledAt, setCampaignScheduledAt] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState("");
  const [campaignRangeStart, setCampaignRangeStart] = useState(0);
  const [campaignRangeLimit, setCampaignRangeLimit] = useState(1000);

  // Sync settings props to local state
  useEffect(() => {
    if (crmSettings) {
      setLocalSettings({ ...crmSettings });
      setPdfFoodUrl(`/uploads/food_menu.pdf?t=${Date.now()}`);
      setPdfBarUrl(`/uploads/bar_menu.pdf?t=${Date.now()}`);
    }
  }, [crmSettings]);

  // WhatsApp connection states
  const [waStatus, setWaStatus] = useState("disconnected");
  const [waQR, setWaQR] = useState(null);

  const fetchWhatsAppStatus = async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/status");
      const data = await res.json();
      if (data.success) {
        setWaStatus(data.status);
        setWaQR(data.qr);
      }
    } catch (err) {
      console.error("Error fetching WhatsApp status:", err);
    }
  };

  const handleWaAction = async (action) => {
    try {
      const res = await fetch("/api/admin/whatsapp/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (data.success) {
        fetchWhatsAppStatus();
      }
    } catch (err) {
      console.error(`Error executing WhatsApp action ${action}:`, err);
    }
  };

  useEffect(() => {
    if (activeTab !== "settings") return;

    fetchWhatsAppStatus();
    const interval = setInterval(fetchWhatsAppStatus, 30000);

    return () => clearInterval(interval);
  }, [activeTab]);

  // ────────────────────────────────────────────────────────
  // STAFF ACCOUNTS FUNCTIONS
  // ────────────────────────────────────────────────────────
  const handleSaveStaff = async (e) => {
    e.preventDefault();
    if (!staffUsername || !staffEmail || !staffName || (!editingStaffId && !staffPassword)) {
      setStaffError("Please fill in all required fields.");
      return;
    }
    setSubmittingStaff(true);
    setStaffError("");

    try {
      const payload = {
        action: editingStaffId ? "edit" : "create",
        id: editingStaffId,
        username: staffUsername,
        email: staffEmail,
        name: staffName,
        password: staffPassword,
      };

      const res = await fetch("/api/admin/crm/checkin-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert(editingStaffId ? "Staff account details updated successfully." : "New staff account created successfully.");
        setStaffUsername("");
        setStaffEmail("");
        setStaffName("");
        setStaffPassword("");
        setEditingStaffId(null);
        setShowStaffForm(false);
        fetchStaffData();
      } else {
        setStaffError(data.error || "Failed to save staff account.");
      }
    } catch (err) {
      setStaffError("Network communication error.");
    } finally {
      setSubmittingStaff(false);
    }
  };

  const handleEditStaff = (user) => {
    setEditingStaffId(user._id);
    setStaffUsername(user.username);
    setStaffEmail(user.email);
    setStaffName(user.name);
    setStaffPassword("");
    setShowStaffForm(true);
  };

  const handleToggleStaffStatus = async (id, currentStatus) => {
    const nextStatus = currentStatus === "active" ? "disabled" : "active";
    if (!confirm(`Are you sure you want to change this staff user's status to ${nextStatus}?`)) return;
    try {
      const res = await fetch("/api/admin/crm/checkin-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ action: "toggle-status", id, status: nextStatus })
      });
      const data = await res.json();
      if (data.success) {
        alert("Status updated successfully.");
        fetchStaffData();
      } else {
        alert(data.error || "Failed to update status.");
      }
    } catch (err) {
      alert("Network error.");
    }
  };

  const handleResetStaffPassword = async (id) => {
    const newPass = prompt("Enter new password for this staff member (min 6 chars):");
    if (!newPass) return;
    if (newPass.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }
    try {
      const res = await fetch("/api/admin/crm/checkin-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ action: "reset-password", id, password: newPass })
      });
      const data = await res.json();
      if (data.success) {
        alert("Password reset successfully.");
      } else {
        alert(data.error || "Failed to reset password.");
      }
    } catch (err) {
      alert("Network error.");
    }
  };

  // ────────────────────────────────────────────────────────
  // CRM SETTINGS FUNCTIONS
  // ────────────────────────────────────────────────────────
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsError("");

    try {
      const res = await fetch("/api/admin/crm/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(localSettings)
      });
      const data = await res.json();
      if (data.success) {
        alert("CRM settings updated successfully.");
        fetchCrmSettings();
      } else {
        setSettingsError(data.error || "Failed to save settings.");
      }
    } catch (err) {
      setSettingsError("Communication error saving settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpdateSettingField = (key, val) => {
    setLocalSettings(prev => ({ ...prev, [key]: val }));
  };

  const handlePdfUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      alert("Please select a valid PDF file.");
      return;
    }

    if (type === "food") setUploadingFoodPdf(true);
    else setUploadingBarPdf(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const res = await fetch("/api/admin/menu/upload-pdf", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        alert("Menu PDF uploaded successfully.");
        const cacheBusterUrl = `${data.url}?t=${Date.now()}`;
        if (type === "food") setPdfFoodUrl(cacheBusterUrl);
        else setPdfBarUrl(cacheBusterUrl);
      } else {
        alert(data.error || "PDF upload failed.");
      }
    } catch (err) {
      alert("PDF Upload failed due to network error.");
    } finally {
      if (type === "food") setUploadingFoodPdf(false);
      else setUploadingBarPdf(false);
    }
  };

  const handleMigrateSync = async () => {
    if (!confirm("This will scan the bookings, messages, and subscribers list and merge them into the central CRM. Continue?")) return;
    try {
      const res = await fetch("/api/admin/crm/migrate", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        alert(`Migration completed! Merged data: ${data.summary.totalMerged} total records. Check CRM Directory.`);
      } else {
        alert(data.error || "Migration failed.");
      }
    } catch (err) {
      alert("Network error executing migration.");
    }
  };

  // ────────────────────────────────────────────────────────
  // MARKETING CAMPAIGN FUNCTIONS
  // ────────────────────────────────────────────────────────
  const handleBroadcastCampaign = async (e) => {
    e.preventDefault();
    if (!campaignTitle || !campaignSubject || !campaignContent) {
      alert("Please fill in all campaign fields.");
      return;
    }

    if (campaignStatus === "sent") {
      if (!confirm("Are you sure you want to broadcast this campaign immediately? This will send bulk messages.")) return;
    }

    setBroadcasting(true);
    setBroadcastStatus("Processing campaign broadcast...");

    try {
      const res = await fetch("/api/admin/crm/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          title: campaignTitle,
          subject: campaignSubject,
          content: campaignContent,
          imageUrl: campaignImageUrl,
          channels: campaignChannels,
          audience: campaignAudience,
          campaignType: campaignType,
          status: campaignStatus,
          scheduledAt: campaignStatus === "scheduled" ? campaignScheduledAt : null,
          rangeStart: campaignRangeStart,
          rangeLimit: campaignRangeLimit
        })
      });
      const data = await res.json();
      if (data.success) {
        setBroadcastStatus(data.message);
        setCampaignTitle("");
        setCampaignSubject("");
        setCampaignContent("");
        setCampaignImageUrl("");
        setCampaignRangeStart(0);
        setCampaignRangeLimit(1000);
        fetchCampaigns();
      } else {
        setBroadcastStatus(`Error: ${data.error}`);
      }
    } catch (err) {
      setBroadcastStatus("Communication error sending campaign.");
    } finally {
      setBroadcasting(false);
    }
  };

  const handleToggleChannel = (channel) => {
    if (campaignChannels.includes(channel)) {
      setCampaignChannels(campaignChannels.filter(c => c !== channel));
    } else {
      setCampaignChannels([...campaignChannels, channel]);
    }
  };


  const handleDeleteCampaign = async (id) => {
    if (!confirm("Are you sure you want to delete this campaign?")) return;
    try {
      const res = await fetch(`/api/admin/crm/campaigns/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        alert("Campaign deleted.");
        fetchCampaigns();
      } else {
        alert(data.error || "Failed to delete.");
      }
    } catch (err) {
      alert("Network error.");
    }
  };

  return (
    <>
      <style>{`
        /* Global CRM Admin tab enhancements */
        .admin-crm-container {
          display: flex;
          flex-direction: column;
          gap: 30px;
          color: #f2e8d5;
        }
        .admin-crm-card {
          background-color: #0d1412 !important;
          border: 1px solid rgba(242, 232, 213, 0.08) !important;
          border-radius: 12px !important;
          padding: 30px !important;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5) !important;
          transition: border-color 0.3s, box-shadow 0.3s;
        }
        .admin-crm-card:hover {
          border-color: rgba(201, 168, 76, 0.2) !important;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6) !important;
        }
        .admin-crm-container input, 
        .admin-crm-container select, 
        .admin-crm-container textarea {
          background-color: #060a09 !important;
          border: 1px solid rgba(242, 232, 213, 0.15) !important;
          border-radius: 6px !important;
          color: #f2e8d5 !important;
          padding: 12px 15px !important;
          font-size: 14px !important;
          outline: none !important;
          transition: border-color 0.25s, box-shadow 0.25s !important;
          width: 100%;
          box-sizing: border-box;
        }
        .admin-crm-container input:focus, 
        .admin-crm-container select:focus, 
        .admin-crm-container textarea:focus {
          border-color: #c9a84c !important;
          box-shadow: 0 0 8px rgba(201, 168, 76, 0.25) !important;
        }
        .admin-crm-container button[type="submit"], 
        .admin-crm-container button.btn-gold-trigger {
          background: linear-gradient(135deg, #c9a84c 0%, #a88432 100%) !important;
          color: #060f0d !important;
          border: none !important;
          border-radius: 6px !important;
          padding: 12px 24px !important;
          font-size: 13px !important;
          font-family: var(--font-josefin), sans-serif !important;
          font-weight: bold !important;
          letter-spacing: 1px !important;
          text-transform: uppercase !important;
          cursor: pointer !important;
          transition: all 0.25s ease !important;
          box-shadow: 0 4px 15px rgba(201, 168, 76, 0.2) !important;
          align-self: flex-start;
        }
        .admin-crm-container button[type="submit"]:hover, 
        .admin-crm-container button.btn-gold-trigger:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(201, 168, 76, 0.35) !important;
          background: #e5c365 !important;
        }
        .admin-crm-container button[type="submit"]:active, 
        .admin-crm-container button.btn-gold-trigger:active {
          transform: translateY(0);
        }
        .admin-crm-container button[type="submit"]:disabled, 
        .admin-crm-container button.btn-gold-trigger:disabled {
          background: #444 !important;
          color: #888 !important;
          cursor: not-allowed !important;
        }
        
        /* Table Styling */
        .admin-crm-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .admin-crm-table tr {
          border-bottom: 1px solid rgba(255, 255, 255, 0.02) !important;
          transition: background-color 0.2s !important;
        }
        .admin-crm-table tr:hover {
          background-color: rgba(201, 168, 76, 0.04) !important;
        }
        .admin-crm-table th {
          padding: 14px 18px !important;
          font-family: var(--font-josefin), sans-serif !important;
          font-size: 11px !important;
          letter-spacing: 1.5px !important;
          text-transform: uppercase !important;
          color: #888 !important;
          border-bottom: 1px solid rgba(201, 168, 76, 0.15) !important;
          background-color: #060a09 !important;
        }
        .admin-crm-table td {
          padding: 14px 18px !important;
          font-size: 13px !important;
          color: #f2e8d5 !important;
        }
        
        .admin-grid-two-col {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 20px !important;
        }
        .admin-grid-three-col {
          display: grid !important;
          grid-template-columns: 1fr 1fr 1fr !important;
          gap: 20px !important;
        }
        .admin-crm-btn-secondary {
          background-color: transparent !important;
          border: 1px solid rgba(201, 168, 76, 0.4) !important;
          border-radius: 4px !important;
          color: #c9a84c !important;
          padding: 10px 18px !important;
          font-size: 12px !important;
          cursor: pointer !important;
          font-family: var(--font-josefin), sans-serif !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          transition: background-color 0.3s, color 0.3s !important;
        }
        .admin-crm-btn-secondary:hover {
          background-color: rgba(201, 168, 76, 0.1) !important;
        }
        
        /* Responsive adaptations */
        @media (max-width: 768px) {
          .admin-grid-two-col, .admin-grid-three-col {
            grid-template-columns: 1fr !important;
          }
          .admin-crm-table th, .admin-crm-table td {
            padding: 10px 8px !important;
            font-size: 12px !important;
          }
          .admin-crm-card {
            padding: 20px 15px !important;
          }
        }

      `}</style>

      {/* WHATSAPP & EMAIL MARKETING CAMPAIGNS */}
      {activeTab === "marketing" && (
        <div className="admin-crm-container">
          <div style={styles.card} className="admin-crm-card">
            <h3 style={styles.sectionTitle}>Dispatch Marketing Campaign</h3>
            <form onSubmit={handleBroadcastCampaign} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Message Subject / Heading</label>
                <input
                  type="text"
                  placeholder="e.g. ✦ Join Us for Sufi Night this Friday!"
                  value={campaignSubject}
                  onChange={(e) => {
                    setCampaignSubject(e.target.value);
                    setCampaignTitle(e.target.value);
                  }}
                  style={styles.textInput}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Campaign Image URL</label>
                <input
                  type="url"
                  placeholder="e.g. https://www.humtumbar.in/assets/promotional-banner.jpg"
                  value={campaignImageUrl}
                  onChange={(e) => setCampaignImageUrl(e.target.value)}
                  style={styles.textInput}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Dispatch Channels</label>
                <div style={{ display: "flex", gap: "15px", padding: "10px 0" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px" }}>
                    <input 
                      type="checkbox" 
                      checked={campaignChannels.includes("email")} 
                      onChange={() => handleToggleChannel("email")} 
                    />
                    Email
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px" }}>
                    <input 
                      type="checkbox" 
                      checked={campaignChannels.includes("whatsapp")} 
                      onChange={() => handleToggleChannel("whatsapp")} 
                    />
                    WhatsApp
                  </label>
                </div>
              </div>

              <div className="admin-grid-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "15px" }}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Recipient Start Index (Offset)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 0 for Day 1"
                    value={campaignRangeStart}
                    onChange={(e) => setCampaignRangeStart(parseInt(e.target.value) || 0)}
                    style={styles.textInput}
                  />
                  <p style={{ ...styles.tipText, marginTop: "4px" }}>Index to start sending. Use 0 for Day 1, 1000 for Day 2, etc.</p>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Max Recipients (Limit)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 1000"
                    value={campaignRangeLimit}
                    onChange={(e) => setCampaignRangeLimit(parseInt(e.target.value) || 0)}
                    style={styles.textInput}
                  />
                  <p style={{ ...styles.tipText, marginTop: "4px" }}>Maximum customers to target in this batch (0 for all).</p>
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Campaign Message Content</label>
                <textarea
                  rows={8}
                  placeholder="Body content of the newsletter or WhatsApp notification..."
                  value={campaignContent}
                  onChange={(e) => setCampaignContent(e.target.value)}
                  style={styles.textareaInput}
                  required
                />
              </div>

              <button type="submit" disabled={broadcasting} style={styles.btnGold}>
                {broadcasting ? "Broadcasting..." : "Launch Campaign"}
              </button>
              
              {broadcastStatus && <p style={styles.statusLabel}>{broadcastStatus}</p>}
            </form>
          </div>

          {/* Campaigns analytics list */}
          <div style={styles.card} className="admin-crm-card">
            <h3 style={styles.sectionTitle}>Campaign History &amp; Analytics</h3>
            {campaignsList.length === 0 ? (
              <p style={{ color: "#888", fontSize: "14px" }}>No campaigns registered in CRM database.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table} className="admin-crm-table">
                  <thead>
                    <tr style={styles.trHead}>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Type</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Email Sent/Opened/Rate</th>
                      <th style={styles.th}>WA Sent/Delivered/Read</th>
                      <th style={styles.th}>Dispatched At</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignsList.map(c => (
                      <tr key={c._id} style={styles.trBody}>
                        <td style={{ ...styles.td, fontWeight: "bold" }}>{c.title}</td>
                        <td style={styles.td}>{c.campaignType}</td>
                        <td style={styles.td}>
                          <span style={{ 
                            color: c.status === "sent" ? "#28a745" : c.status === "draft" ? "#888" : "#c9a84c",
                            textTransform: "uppercase",
                            fontWeight: "bold",
                            fontSize: "12px"
                          }}>{c.status}</span>
                        </td>
                        <td style={styles.td}>
                          ✉️ {c.analytics.emailsSent} / {c.analytics.emailsOpened} / <strong style={{ color: "#c9a84c" }}>{Math.round(c.analytics.emailClickRate)}%</strong>
                        </td>
                        <td style={styles.td}>
                          💬 {c.analytics.whatsappSent} / {c.analytics.whatsappDelivered} / {c.analytics.whatsappRead}
                        </td>
                        <td style={styles.td}>
                          {c.sentAt ? new Date(c.sentAt).toLocaleString() : c.scheduledAt ? `Sched: ${new Date(c.scheduledAt).toLocaleString()}` : "Draft"}
                        </td>
                        <td style={styles.td}>
                          <button onClick={() => handleDeleteCampaign(c._id)} style={styles.btnTableMiniDanger}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STAFF ACCOUNTS TAB */}
      {activeTab === "staff" && (
        <div className="admin-crm-container">
          <div style={styles.card} className="admin-crm-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={styles.sectionTitle}>Check-In Reception Accounts</h3>
              <button 
                onClick={() => {
                  setShowStaffForm(!showStaffForm);
                  setEditingStaffId(null);
                  setStaffName("");
                  setStaffUsername("");
                  setStaffEmail("");
                  setStaffPassword("");
                  setStaffError("");
                }} 
                style={styles.btnGold}
                className="btn-gold-trigger"
              >
                {showStaffForm ? "View Accounts List" : "+ Create Staff User"}
              </button>
            </div>

            {showStaffForm ? (
              <form onSubmit={handleSaveStaff} style={styles.form}>
                <h4 style={{ color: "#c9a84c", margin: "0 0 10px 0" }}>
                  {editingStaffId ? "Edit Staff Account Details" : "Create New Check-In Staff Account"}
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }} className="admin-grid-two-col">
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Full Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Alok Gupta" 
                      value={staffName} 
                      onChange={(e) => setStaffName(e.target.value)} 
                      style={styles.textInput}
                      required
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Username</label>
                    <input 
                      type="text" 
                      placeholder="e.g. reception_alok" 
                      value={staffUsername} 
                      onChange={(e) => setStaffUsername(e.target.value)} 
                      style={styles.textInput}
                      required
                    />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }} className="admin-grid-two-col">
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Email Address</label>
                    <input 
                      type="email" 
                      placeholder="e.g. alok@humtumbar.in" 
                      value={staffEmail} 
                      onChange={(e) => setStaffEmail(e.target.value)} 
                      style={styles.textInput}
                      required
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Password {editingStaffId && "(Leave empty to keep same)"}</label>
                    <input 
                      type="password" 
                      placeholder={editingStaffId ? "Enter to change password" : "Min 6 characters"} 
                      value={staffPassword} 
                      onChange={(e) => setStaffPassword(e.target.value)} 
                      style={styles.textInput}
                      required={!editingStaffId}
                    />
                  </div>
                </div>
                {staffError && <p style={{ color: "#dc3545", margin: 0, fontSize: "14px" }}>{staffError}</p>}
                <button type="submit" disabled={submittingStaff} style={styles.btnGold}>
                  {submittingStaff ? "Saving Account..." : "Save Account"}
                </button>
              </form>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table} className="admin-crm-table">
                  <thead>
                    <tr style={styles.trHead}>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Username</th>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Created Date</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffUsers.map(u => (
                      <tr key={u._id} style={styles.trBody} className="admin-tr-body">
                        <td style={{ ...styles.td, fontWeight: "bold" }}>{u.name}</td>
                        <td style={styles.td}>{u.username}</td>
                        <td style={styles.td}>{u.email}</td>
                        <td style={styles.td}>
                          <span style={{ 
                            color: u.status === "active" ? "#28a745" : "#dc3545",
                            fontWeight: "bold",
                            fontSize: "12px",
                            textTransform: "uppercase"
                          }}>{u.status}</span>
                        </td>
                        <td style={styles.td}>{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td style={styles.td}>
                          <button onClick={() => handleEditStaff(u)} style={styles.btnTableMini}>Edit</button>
                          <button 
                            onClick={() => handleToggleStaffStatus(u._id, u.status)} 
                            style={u.status === "active" ? styles.btnTableMiniDanger : styles.btnTableMini}
                          >
                            {u.status === "active" ? "Disable" : "Enable"}
                          </button>
                          <button onClick={() => handleResetStaffPassword(u._id)} style={styles.btnTableMini}>Reset Pass</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Login Activity logs */}
          <div style={styles.card} className="admin-crm-card">
            <h3 style={styles.sectionTitle}>Recent Login Attempts Activity</h3>
            <div style={{ overflowY: "auto", maxHeight: "350px" }}>
              <table style={styles.table} className="admin-crm-table">
                <thead>
                  <tr style={styles.trHead}>
                    <th style={styles.th}>Timestamp</th>
                    <th style={styles.th}>Username</th>
                    <th style={styles.th}>IP Address</th>
                    <th style={styles.th}>Browser User-Agent</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loginActivities.map((log) => (
                    <tr key={log._id} style={styles.trBody} className="admin-tr-body">
                      <td style={styles.td}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td style={{ ...styles.td, fontWeight: "bold" }}>{log.username}</td>
                      <td style={styles.td}>{log.ipAddress}</td>
                      <td style={styles.td}>
                        <div style={{ maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {log.userAgent}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={{ 
                          color: log.status === "success" ? "#28a745" : "#dc3545",
                          fontWeight: "bold",
                          textTransform: "uppercase",
                          fontSize: "11px"
                        }}>{log.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CRM GLOBAL SETTINGS TAB */}
      {activeTab === "settings" && localSettings && (
        <div style={{ display: "flex", flexDirection: "column", gap: "40px" }} className="admin-crm-container">
          <div style={styles.card} className="admin-crm-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }} className="mobile-column-stack">
              <h3 style={styles.sectionTitle}>Unified CRM Marketing Settings</h3>
              <button type="button" onClick={handleMigrateSync} style={styles.btnSecondary} className="admin-crm-btn-secondary">
                Migrate &amp; Sync Historical Database
              </button>
            </div>
            
            <form onSubmit={handleSaveSettings} style={styles.form}>
              <h4 style={styles.tabHeadingMini}>WhatsApp Web Free Integration (Link Device)</h4>
              <div style={{
                background: "rgba(255, 255, 255, 0.03)",
                padding: "20px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                marginBottom: "25px",
                boxShadow: "0 4px 30px rgba(0, 0, 0, 0.1)",
                backdropFilter: "blur(5px)"
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                  <div>
                    <span style={{ fontSize: "14px", color: "#aaa" }}>Connection Status:</span>
                    <span style={{
                      marginLeft: "10px",
                      fontSize: "14px",
                      fontWeight: "bold",
                      color: waStatus === "ready" ? "#28a745" : waStatus === "qr" ? "#ffc107" : waStatus === "connecting" ? "#17a2b8" : "#dc3545",
                      textTransform: "uppercase"
                    }}>
                      {waStatus}
                    </span>
                  </div>
                  <div>
                    {waStatus === "ready" ? (
                      <button
                        type="button"
                        onClick={() => handleWaAction("logout")}
                        style={{
                          background: "#dc3545",
                          color: "#fff",
                          border: "none",
                          padding: "8px 16px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontWeight: "bold"
                        }}
                      >
                        Disconnect / Logout
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleWaAction("reconnect")}
                        style={{
                          background: "#c9a84c",
                          color: "#000",
                          border: "none",
                          padding: "8px 16px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontWeight: "bold"
                        }}
                      >
                        Refresh / Reconnect
                      </button>
                    )}
                  </div>
                </div>

                {waStatus === "qr" && waQR && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "15px" }}>
                    <p style={{ color: "#fff", marginBottom: "15px", fontSize: "14px", textAlign: "center" }}>
                      Scan this QR code with your WhatsApp Business app to link your account:
                    </p>
                    <div style={{ background: "#fff", padding: "15px", borderRadius: "8px" }}>
                      <img src={waQR} alt="WhatsApp QR Code" style={{ width: "250px", height: "250px", display: "block" }} />
                    </div>
                    <p style={{ color: "#888", marginTop: "10px", fontSize: "12px" }}>
                      Keep scanning active. Once linked, the status above will change to "READY".
                    </p>
                  </div>
                )}

                {waStatus === "ready" && (
                  <div style={{ color: "#28a745", fontSize: "14px", marginTop: "10px" }}>
                    🎉 WhatsApp is successfully linked and active. All automatic messages and campaigns will use this link.
                  </div>
                )}

                {waStatus === "connecting" && (
                  <p style={{ color: "#aaa", fontSize: "14px" }}>
                    Starting headless browser and generating session QR code. Please wait...
                  </p>
                )}

                {waStatus === "disconnected" && (
                  <p style={{ color: "#aaa", fontSize: "14px" }}>
                    WhatsApp is currently disconnected. Click "Refresh / Reconnect" to initialize a new login QR session.
                  </p>
                )}
              </div>

              <h4 style={styles.tabHeadingMini}>Global Brand Connections Links</h4>
              <div className="admin-grid-three-col">
                <div style={styles.formGroup}>
                  <label style={styles.label}>Reservation Link</label>
                  <input
                    type="url"
                    value={localSettings.reservationLink || ""}
                    onChange={(e) => handleUpdateSettingField("reservationLink", e.target.value)}
                    style={styles.textInput}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Instagram Link</label>
                  <input
                    type="url"
                    value={localSettings.instagramLink || ""}
                    onChange={(e) => handleUpdateSettingField("instagramLink", e.target.value)}
                    style={styles.textInput}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Google Review Link</label>
                  <input
                    type="url"
                    value={localSettings.googleReviewLink || ""}
                    onChange={(e) => handleUpdateSettingField("googleReviewLink", e.target.value)}
                    style={styles.textInput}
                  />
                </div>
              </div>

              <h4 style={styles.tabHeadingMini}>Menu PDF Documents (Locally Stored)</h4>
              <div className="admin-grid-two-col">
                <div style={styles.formGroup}>
                  <label style={styles.label}>Upload Food Menu PDF</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => handlePdfUpload(e, "food")}
                    style={styles.fileInput}
                  />
                  {uploadingFoodPdf && <p style={{ color: "#c9a84c", fontSize: "12px", margin: 0 }}>Uploading PDF file...</p>}
                  {pdfFoodUrl && (
                    <a href={pdfFoodUrl} target="_blank" rel="noreferrer" style={styles.pdfPreviewLink}>
                      ✓ View Uploaded Food Menu PDF
                    </a>
                  )}
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Upload Bar Menu PDF</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => handlePdfUpload(e, "bar")}
                    style={styles.fileInput}
                  />
                  {uploadingBarPdf && <p style={{ color: "#c9a84c", fontSize: "12px", margin: 0 }}>Uploading PDF file...</p>}
                  {pdfBarUrl && (
                    <a href={pdfBarUrl} target="_blank" rel="noreferrer" style={styles.pdfPreviewLink}>
                      ✓ View Uploaded Bar Menu PDF
                    </a>
                  )}
                </div>
              </div>

              <h4 style={styles.tabHeadingMini}>Automated Welcome Messages Templates</h4>
              <div className="admin-grid-two-col">
                <div style={styles.formGroup}>
                  <label style={styles.label}>Welcome Email Template (Rich HTML)</label>
                  <textarea
                    rows={6}
                    value={localSettings.welcomeEmailTemplate || ""}
                    onChange={(e) => handleUpdateSettingField("welcomeEmailTemplate", e.target.value)}
                    style={styles.textareaInput}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Welcome WhatsApp Template</label>
                  <textarea
                    rows={6}
                    value={localSettings.welcomeWhatsappTemplate || ""}
                    onChange={(e) => handleUpdateSettingField("welcomeWhatsappTemplate", e.target.value)}
                    style={styles.textareaInput}
                  />
                </div>
              </div>

              <h4 style={styles.tabHeadingMini}>Automatic Birthday Automation Campaigns</h4>
              <div className="admin-grid-two-col" style={{ alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer", color: "#DDD0B8" }}>
                  <input
                    type="checkbox"
                    checked={!!localSettings.birthdayEnabled}
                    onChange={(e) => handleUpdateSettingField("birthdayEnabled", e.target.checked)}
                    style={{ width: "auto", marginRight: "6px" }}
                  />
                  Enable Birthday Campaigns
                </label>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Discount % Offer</label>
                  <input
                    type="number"
                    value={localSettings.birthdayDiscount || 15}
                    onChange={(e) => handleUpdateSettingField("birthdayDiscount", parseInt(e.target.value))}
                    style={styles.textInput}
                  />
                </div>
              </div>
              <div style={styles.formGroup}>
                  <label style={styles.label}>Campaign Image URL</label>
                  <input
                    type="url"
                    value={localSettings.birthdayImageUrl || ""}
                    onChange={(e) => handleUpdateSettingField("birthdayImageUrl", e.target.value)}
                    style={styles.textInput}
                    placeholder="https://example.com/image.jpg"
                  />
              </div>
              <div className="admin-grid-two-col">
                <div style={styles.formGroup}>
                  <label style={styles.label}>Birthday Email Template</label>
                  <textarea
                    rows={4}
                    value={localSettings.birthdayEmailTemplate || ""}
                    onChange={(e) => handleUpdateSettingField("birthdayEmailTemplate", e.target.value)}
                    style={styles.textareaInput}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Birthday WhatsApp Template</label>
                  <textarea
                    rows={4}
                    value={localSettings.birthdayWhatsappTemplate || ""}
                    onChange={(e) => handleUpdateSettingField("birthdayWhatsappTemplate", e.target.value)}
                    style={styles.textareaInput}
                  />
                </div>
              </div>

              <h4 style={styles.tabHeadingMini}>Automatic Anniversary Automation Campaigns</h4>
              <div className="admin-grid-two-col" style={{ alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer", color: "#DDD0B8" }}>
                  <input
                    type="checkbox"
                    checked={!!localSettings.anniversaryEnabled}
                    onChange={(e) => handleUpdateSettingField("anniversaryEnabled", e.target.checked)}
                    style={{ width: "auto", marginRight: "6px" }}
                  />
                  Enable Anniversary Campaigns
                </label>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Discount % Offer</label>
                  <input
                    type="number"
                    value={localSettings.anniversaryDiscount || 20}
                    onChange={(e) => handleUpdateSettingField("anniversaryDiscount", parseInt(e.target.value))}
                    style={styles.textInput}
                  />
                </div>
              </div>
              <div className="admin-grid-two-col">
                <div style={styles.formGroup}>
                  <label style={styles.label}>Anniversary Email Template</label>
                  <textarea
                    rows={4}
                    value={localSettings.anniversaryEmailTemplate || ""}
                    onChange={(e) => handleUpdateSettingField("anniversaryEmailTemplate", e.target.value)}
                    style={styles.textareaInput}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Anniversary WhatsApp Template</label>
                  <textarea
                    rows={4}
                    value={localSettings.anniversaryWhatsappTemplate || ""}
                    onChange={(e) => handleUpdateSettingField("anniversaryWhatsappTemplate", e.target.value)}
                    style={styles.textareaInput}
                  />
                </div>
              </div>

              {settingsError && <p style={{ color: "#dc3545", fontSize: "14px" }}>{settingsError}</p>}
              <button type="submit" disabled={savingSettings} style={styles.btnGold}>
                {savingSettings ? "Saving Settings..." : "Save CRM Settings"}
              </button>
            </form>
          </div>
        </div>
      )}

    </>
  );
}

const styles = {
  card: {
    backgroundColor: "#0d1412",
    border: "1px solid rgba(242,232,213,0.08)",
    borderRadius: "6px",
    padding: "30px",
    width: "100%",
  },
  sectionTitle: {
    fontFamily: "var(--font-playfair), serif",
    fontSize: "20px",
    color: "#c9a84c",
    margin: "0 0 20px 0",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "1px",
    color: "#DDD0B8",
  },
  textInput: {
    backgroundColor: "#060a09",
    border: "1px solid rgba(242,232,213,0.15)",
    color: "#f2e8d5",
    padding: "12px",
    borderRadius: "4px",
    fontSize: "14px",
    outline: "none",
  },
  selectInput: {
    backgroundColor: "#060a09",
    border: "1px solid rgba(242,232,213,0.15)",
    color: "#f2e8d5",
    padding: "12px",
    borderRadius: "4px",
    fontSize: "14px",
    outline: "none",
    width: "100%",
  },
  textareaInput: {
    backgroundColor: "#060a09",
    border: "1px solid rgba(242,232,213,0.15)",
    color: "#f2e8d5",
    padding: "12px",
    borderRadius: "4px",
    fontSize: "14px",
    fontFamily: "var(--font-lato), sans-serif",
    outline: "none",
    resize: "vertical",
  },
  btnGold: {
    backgroundColor: "#c9a84c",
    color: "#060f0d",
    border: "none",
    borderRadius: "4px",
    padding: "12px 24px",
    fontSize: "13px",
    fontFamily: "var(--font-josefin), sans-serif",
    letterSpacing: "1px",
    textTransform: "uppercase",
    cursor: "pointer",
    fontWeight: "bold",
    alignSelf: "flex-start",
  },
  btnSecondary: {
    backgroundColor: "transparent",
    border: "1px solid rgba(201, 168, 76, 0.4)",
    borderRadius: "4px",
    color: "#c9a84c",
    padding: "10px 18px",
    fontSize: "12px",
    cursor: "pointer",
    fontFamily: "var(--font-josefin), sans-serif",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  statusLabel: {
    fontSize: "13px",
    color: "#28a745",
    margin: "5px 0 0 0",
  },
  tipText: {
    margin: "0 0 5px 0",
    fontSize: "12px",
    color: "#888",
    lineHeight: "1.4",
  },
  tabHeadingMini: {
    fontFamily: "var(--font-playfair), serif",
    color: "#c9a84c",
    fontSize: "16px",
    margin: "15px 0 5px 0",
    borderBottom: "1px dashed rgba(201,168,76,0.15)",
    paddingBottom: "6px",
  },
  fileInput: {
    color: "#888",
    fontSize: "13px",
  },
  pdfPreviewLink: {
    color: "#28a745",
    fontSize: "12px",
    textDecoration: "underline",
    marginTop: "5px",
    display: "inline-block",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  trHead: {
    borderBottom: "1px solid rgba(201,168,76,0.15)",
    backgroundColor: "#060a09",
  },
  th: {
    padding: "12px 15px",
    fontFamily: "var(--font-josefin), sans-serif",
    fontSize: "11px",
    letterSpacing: "1.5px",
    textTransform: "uppercase",
    color: "#888",
  },
  trBody: {
    borderBottom: "1px solid rgba(255,255,255,0.02)",
  },
  td: {
    padding: "12px 15px",
    fontSize: "13px",
    color: "#f2e8d5",
    whiteSpace: "nowrap",
  },
  btnTableMini: {
    backgroundColor: "transparent",
    border: "1px solid rgba(242,232,213,0.15)",
    borderRadius: "3px",
    color: "#DDD0B8",
    padding: "4px 8px",
    fontSize: "11px",
    cursor: "pointer",
    marginRight: "8px",
  },
  btnTableMiniDanger: {
    backgroundColor: "transparent",
    border: "1px solid rgba(220, 53, 69, 0.3)",
    borderRadius: "3px",
    color: "#dc3545",
    padding: "4px 8px",
    fontSize: "11px",
    cursor: "pointer",
    marginRight: "8px",
  }
};
