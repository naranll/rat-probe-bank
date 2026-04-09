import React, { useState } from "react";
import { useAuth } from "../context/AuthContext"; 

const TransferForm = () => {
  const { specialId } = useAuth(); // ← only specialId for now (api is ready but not used yet)

  const [formData, setFormData] = useState({
    recipientName: "",
    recipientAccount: "",
    amount: "",
    description: "",
    transferType: "immediate",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPin, setAuthPin] = useState("");

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (
      !formData.recipientName ||
      !formData.recipientAccount ||
      !formData.amount
    ) {
      alert("Please fill in all required fields");
      return;
    }
    setShowAuthModal(true);
  };

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    if (authPin.length !== 4) {
      alert("Please enter a valid 4-digit PIN");
      return;
    }

    setIsSubmitting(true);

    // Simulate API call (feels 100% real while backend is not ready)
    setTimeout(() => {
      setIsSubmitting(false);
      setShowAuthModal(false);
      setAuthPin("");

      alert(
        `✅ Transfer successful!\n\nSent to ${formData.recipientName} (${formData.recipientAccount})\nAmount: USD ${formData.amount}\nAuthenticated with your Special ID: ${specialId}`,
      );

      // Reset form
      setFormData({
        recipientName: "",
        recipientAccount: "",
        amount: "",
        description: "",
        transferType: "immediate",
      });
    }, 2000);
  };

  const closeModal = () => {
    setShowAuthModal(false);
    setAuthPin("");
  };

  return (
    <div className="transfer-form-container">
      <form onSubmit={handleSubmit} className="transfer-form">
        <h2 className="form-title">Transfer Money</h2>

        <div className="form-group">
          <label htmlFor="recipientName" className="form-label">
            Recipient Name <span className="required">*</span>
          </label>
          <input
            type="text"
            id="recipientName"
            name="recipientName"
            value={formData.recipientName}
            onChange={handleInputChange}
            className="form-input"
            placeholder="Enter recipient's full name"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="recipientAccount" className="form-label">
            Recipient Account Number <span className="required">*</span>
          </label>
          <input
            type="text"
            id="recipientAccount"
            name="recipientAccount"
            value={formData.recipientAccount}
            onChange={handleInputChange}
            className="form-input"
            placeholder="Enter account number"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="amount" className="form-label">
            Amount <span className="required">*</span>
          </label>
          <div className="amount-input-group">
            <span className="currency-prefix">CNY</span>
            <input
              type="number"
              id="amount"
              name="amount"
              value={formData.amount}
              onChange={handleInputChange}
              className="form-input amount-input"
              placeholder="0.00"
              min="0"
              step="0.01"
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="description" className="form-label">
            Description (Optional)
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            className="form-textarea"
            placeholder="Enter transfer description"
            rows="3"
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="submit-btn" disabled={isSubmitting}>
            {isSubmitting ? "Processing..." : "Transfer Money"}
          </button>
        </div>
      </form>

      {/* Authentication Modal - exactly your original */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Authentication Required</h3>
              <button className="close-btn" onClick={closeModal}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-description">
                Please enter your 4-digit PIN to authorize this transfer
              </p>

              <form onSubmit={handleAuthSubmit}>
                <div className="pin-input-group">
                  <input
                    type="password"
                    value={authPin}
                    onChange={(e) => setAuthPin(e.target.value)}
                    className="pin-input"
                    maxLength="4"
                    placeholder="••••"
                    autoFocus
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="confirm-btn"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Processing..." : "Confirm Transfer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransferForm;
