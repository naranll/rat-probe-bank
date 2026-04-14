import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiGetBalance, apiGetHistory } from "../util/api";
import TransferModal from "../components/TransferModal";

export default function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoadingBalance(true);
    setLoadingHistory(true);
    try {
      const [bal, hist] = await Promise.all([
        apiGetBalance(user.username),
        apiGetHistory(user.username),
      ]);
      setBalance(bal);
      setHistory(hist);
    } catch {
      /* silently fail — balance stays null */
    } finally {
      setLoadingBalance(false);
      setLoadingHistory(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchData();
  }, [user, fetchData, navigate]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (!user) return null;

  return (
    <div style={styles.page}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>⬡ RAT Detection</div>
        <nav style={styles.nav}>
          <div style={{ ...styles.navItem, ...styles.navActive }}>
            Dashboard
          </div>
        </nav>
        <div style={styles.sidebarBottom}>
          <div style={styles.userChip}>
            <span style={styles.userDot}>●</span>
            <span style={styles.userName}>{user.username}</span>
          </div>
          <button style={styles.logoutBtn} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={styles.main}>
        <div style={styles.topBar}>
          <h1 style={styles.pageTitle}>Dashboard</h1>
          <button
            style={styles.transferBtn}
            onClick={() => setShowTransfer(true)}
          >
            + Transfer
          </button>
        </div>

        {/* Balance card */}
        <div style={styles.balanceCard}>
          <p style={styles.balanceLabel}>Available balance</p>
          {loadingBalance ? (
            <p style={styles.balanceLoading}>Loading…</p>
          ) : (
            <p style={styles.balanceAmount}>
              {balance !== null
                ? `$${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                : "—"}
            </p>
          )}
          <p style={styles.balanceAccount}>{user.username} · RatProbe Bank</p>
        </div>

        {/* Transaction history */}
        <div style={styles.historySection}>
          <h2 style={styles.sectionTitle}>Transaction history</h2>

          {loadingHistory ? (
            <p style={styles.hint}>Loading…</p>
          ) : history.length === 0 ? (
            <p style={styles.hint}>No transactions yet.</p>
          ) : (
            <div style={styles.txList}>
              {history.map((tx) => {
                const isSent = tx.fromUser === user.username;
                return (
                  <div key={tx.id} style={styles.txRow}>
                    <div style={styles.txIcon}>{isSent ? "↑" : "↓"}</div>
                    <div style={styles.txDetails}>
                      <span style={styles.txParty}>
                        {isSent ? `To ${tx.toUser}` : `From ${tx.fromUser}`}
                      </span>
                      <span style={styles.txTime}>
                        {new Date(tx.time).toLocaleString()}
                      </span>
                    </div>
                    <span
                      style={{
                        ...styles.txAmount,
                        color: isSent ? "#f87171" : "#4ade80",
                      }}
                    >
                      {isSent ? "-" : "+"}$
                      {tx.amount.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <TransferModal
        visible={showTransfer}
        onClose={() => setShowTransfer(false)}
        username={user.username}
        onSuccess={fetchData}
      />
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    height: "100vh",
    background: "#0f1117",
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#f0f4ff",
    minWidth: "100vw",
    overflow: "hidden", //jic
  },
  sidebar: {
    width: "220px",
    maxHeight: "100vh",
    background: "#161b27",
    borderRight: "1px solid #2a3045",
    display: "flex",
    flexDirection: "column",
    padding: "24px 16px",
    flexShrink: 0,
    boxSizing: "border-box",
  },
  sidebarLogo: {
    color: "#4ade80",
    fontWeight: 700,
    fontSize: "18px",
    letterSpacing: "0.05em",
    marginBottom: "40px",
    paddingLeft: "8px",
  },
  nav: { flex: 1 },
  navItem: {
    padding: "10px 12px",
    borderRadius: "6px",
    fontSize: "13px",
    cursor: "pointer",
    color: "#6b7fa3",
  },
  navActive: {
    background: "rgba(74,222,128,0.08)",
    color: "#4ade80",
    borderLeft: "2px solid #4ade80",
  },
  sidebarBottom: {
    borderTop: "1px solid #2a3045",
    paddingTop: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  userChip: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "0 4px",
  },
  userDot: { color: "#4ade80", fontSize: "10px" },
  userName: {
    color: "#8899bb",
    fontSize: "12px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  logoutBtn: {
    background: "none",
    border: "1px solid #2a3045",
    borderRadius: "6px",
    color: "#6b7fa3",
    padding: "8px",
    fontSize: "12px",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "center",
  },
  main: {
    flex: 1,
    padding: "40px 48px",
    overflowY: "auto",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "32px",
  },
  pageTitle: {
    margin: 0,
    fontSize: "22px",
    fontWeight: 600,
    letterSpacing: "-0.3px",
  },
  transferBtn: {
    background: "#4ade80",
    color: "#0a1a10",
    border: "none",
    borderRadius: "6px",
    padding: "10px 20px",
    fontSize: "13px",
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    letterSpacing: "0.03em",
  },
  balanceCard: {
    background: "linear-gradient(135deg, #1a2235 0%, #1e2d20 100%)",
    border: "1px solid #2a3a2a",
    borderRadius: "12px",
    padding: "32px",
    marginBottom: "32px",
  },
  balanceLabel: {
    margin: "0 0 8px",
    color: "#6b7fa3",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  balanceLoading: { margin: 0, color: "#6b7fa3", fontSize: "36px" },
  balanceAmount: {
    margin: "0 0 8px",
    color: "#4ade80",
    fontSize: "40px",
    fontWeight: 700,
    letterSpacing: "-1px",
  },
  balanceAccount: { margin: 0, color: "#6b7fa3", fontSize: "12px" },
  historySection: {},
  sectionTitle: {
    margin: "0 0 16px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#8899bb",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  hint: { color: "#6b7fa3", fontSize: "13px" },
  txList: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  txRow: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "14px 16px",
    background: "#161b27",
    border: "1px solid #2a3045",
    borderRadius: "8px",
  },
  txIcon: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "#0f1117",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7fa3",
    fontSize: "14px",
    flexShrink: 0,
  },
  txDetails: { flex: 1, display: "flex", flexDirection: "column", gap: "2px" },
  txParty: { fontSize: "13px", color: "#f0f4ff" },
  txTime: { fontSize: "11px", color: "#6b7fa3" },
  txAmount: { fontSize: "14px", fontWeight: 700, whiteSpace: "nowrap" },
};
