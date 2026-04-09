import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiLogin } from "../util/api";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiLogin(username, password);
      login(data); // strips password inside AuthContext
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>⬡</div>
        <h1 style={styles.title}>Sign in</h1>
        <p style={styles.subtitle}>to RatProbe Bank</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Username</label>
          <input
            style={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your_username"
            autoComplete="username"
            required
          />

          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />

          {error && <p style={styles.error}>{error}</p>}

          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>

        <p style={styles.foot}>
          No account?{" "}
          <Link to="/signup" style={styles.link}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f1117",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  card: {
    background: "#161b27",
    border: "1px solid #2a3045",
    borderRadius: "12px",
    padding: "48px 40px",
    width: "100%",
    maxWidth: "400px",
    boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
  },
  logo: {
    fontSize: "32px",
    color: "#4ade80",
    marginBottom: "16px",
  },
  title: {
    margin: 0,
    color: "#f0f4ff",
    fontSize: "24px",
    fontWeight: 600,
    letterSpacing: "-0.5px",
  },
  subtitle: {
    margin: "4px 0 32px",
    color: "#6b7fa3",
    fontSize: "13px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    color: "#8899bb",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginTop: "12px",
  },
  input: {
    background: "#0f1117",
    border: "1px solid #2a3045",
    borderRadius: "6px",
    padding: "10px 14px",
    color: "#f0f4ff",
    fontSize: "14px",
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.2s",
  },
  error: {
    color: "#f87171",
    fontSize: "13px",
    margin: "8px 0 0",
    padding: "8px 12px",
    background: "rgba(248,113,113,0.08)",
    borderRadius: "6px",
    borderLeft: "3px solid #f87171",
  },
  btn: {
    marginTop: "24px",
    padding: "12px",
    background: "#4ade80",
    color: "#0a1a10",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    letterSpacing: "0.03em",
    transition: "opacity 0.2s",
  },
  foot: {
    marginTop: "24px",
    color: "#6b7fa3",
    fontSize: "13px",
    textAlign: "center",
  },
  link: {
    color: "#4ade80",
    textDecoration: "none",
  },
};
