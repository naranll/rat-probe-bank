import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { logout, specialId, token } = useAuth(); // get auth info from context
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const pageName =
    location.pathname
      .split("/")
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" / ") || "Home";

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <h1 style={styles.page}>{pageName}</h1>
      </div>

      <div style={styles.right}>
        <span style={styles.user}>{specialId || "Guest"}</span>
        {token && (
          <button style={styles.button} onClick={handleLogout}>
            Logout
          </button>
        )}
      </div>
    </header>
  );
}

const styles = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 60px",
    backgroundColor: "#1f2937",
    color: "#fff",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    height: "80px",
    width: "100vw",
  },
  left: {},
  right: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  page: {
    margin: 0,
  },
  user: {
    fontWeight: "bold",
  },
  button: {
    padding: "6px 12px",
    backgroundColor: "#ef4444",
    border: "none",
    borderRadius: "4px",
    color: "#fff",
    cursor: "pointer",
  },
};
