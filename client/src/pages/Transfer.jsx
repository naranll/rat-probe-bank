import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import "../styles/transfer.css";
import "../styles/transfer-form.css";
import TransferForm from "../components/TransferForm";
import Header from "../components/Header";

export default function Transfer() {
  const { specialId } = useAuth();

  const [user, setUser] = useState({
    username: localStorage.getItem("username"),
  });

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("token");
  };

  return (
    <div className="page-container">
      <div className="transfer-page">
        <Header user={user} onLogout={handleLogout} />

        {specialId && (
          <div
            className="user-special-id"
            style={{
              marginBottom: "20px",
              padding: "10px",
              background: "#f0f0f0",
              borderRadius: "8px",
            }}
          ></div>
        )}

        <TransferForm />
      </div>
    </div>
  );
}
