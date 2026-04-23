import "../styles/game.css";

const PRACTICE_TRIALS = 3;
const FORMAL_TRIALS = 3;

/**
 * GameRule — shown by TransferModal before the game starts.
 *
 * Props:
 *   onStart  () => void   — proceed to MiniGame
 *   onCancel () => void   — back / close modal
 */
export default function GameRule({ onStart, onCancel }) {
  return (
    <div className="bg-card">
      <div className="bg-header">
        <div className="bg-shield">◈</div>
        <div>
          <p className="bg-title">
            Active Challenge · Remote Control Detection
          </p>
        </div>
      </div>

      <div className="bg-info-box">
        <p className="bg-info-text">
          页面中央有一个持续运动的小球，小球会受到随机扰动。
          <br />
          <strong>通过点击画布来修正小球方向，使其不碰到边界。</strong>
          <br />
          每轮持续 <strong>6 秒</strong>，碰撞即结束。
          <br />
          请尽量自然操作，不要故意放慢或加快节奏。
        </p>
      </div>

      <div className="bg-legend-row">
        <span className="bg-legend">⬤ 安全区</span>
        <span className="bg-legend bg-legend--warning">⬤ 一级危险</span>
        <span className="bg-legend bg-legend--danger">⬤ 二级危险</span>
      </div>

      <div className="bg-trial-plan">
        <span className="bg-trial-plan__item">练习：{PRACTICE_TRIALS} 轮</span>
        <span className="bg-trial-plan__divider">│</span>
        <span className="bg-trial-plan__item">正式：{FORMAL_TRIALS} 轮</span>
      </div>

      <button className="bg-btn-primary" onClick={onStart}>
        开始练习 GO!
      </button>
      <button className="bg-btn-ghost" onClick={onCancel}>
        取消
      </button>
    </div>
  );
}
