import "../styles/game.css";

export default function TransferSuccess({
  condition,
  formalTrials = [],
  onClose,
}) {
  const survived = formalTrials.filter((t) => !t.collisionFlag).length;
  const collided = formalTrials.length - survived;
  const survivalRatePct = formalTrials.length
    ? Math.round((survived / formalTrials.length) * 100)
    : 0;

  return (
    <div className="bg-card">
      <div className="bg-result-icon bg-result-icon--complete">◈</div>
      <p className="bg-title">实验完成</p>
      <p className="bg-session-summary">
        {formalTrials.length} 轮正式实验已完成 · 存活 {survived} 轮 · 碰撞{" "}
        {collided} 轮
      </p>

      <div className="bg-stats-grid">
        <StatCell label="条件" value={condition} />
        <StatCell label="正式轮数" value={formalTrials.length} />
        <StatCell label="存活率" value={`${survivalRatePct}%`} />
      </div>

      <p className="bg-session-footnote">数据已上传，可关闭此窗口。</p>

      <button className="bg-btn-primary" onClick={onClose}>
        关闭
      </button>
    </div>
  );
}

function StatCell({ label, value }) {
  return (
    <div className="bg-stat-cell">
      <span className="bg-stat-cell__label">{label}</span>
      <span className="bg-stat-cell__value">{value}</span>
    </div>
  );
}
