"""
Usage:
    python train_real.py --csv ratprobe_labelled.csv
    python train_real.py --csv ratprobe_labelled.csv --model rf
    python train_real.py --url backend # pull CSV directly

Scientific basis:
    Feature set: Ahmed & Traore (2007), Shen et al. (2012), Feher et al. (2012)
    Models: Logistic Regression (baseline), Random Forest (Shen et al. 2012)
    Evaluation: 5-fold stratified CV, AUC-ROC, F1, FPR (Shamseddine et al. 2021)
"""

import argparse, os, sys, json, warnings
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.linear_model    import LogisticRegression
from sklearn.ensemble        import RandomForestClassifier
from sklearn.preprocessing   import StandardScaler
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.metrics         import (roc_curve, roc_auc_score, confusion_matrix,
                                     f1_score, classification_report)
from sklearn.pipeline        import Pipeline
import joblib

warnings.filterwarnings("ignore")

OUT = "results_real"
os.makedirs(OUT, exist_ok=True)

# Dark theme matching the app
plt.rcParams.update({
    "figure.facecolor": "#0f1117", "axes.facecolor": "#0f1117",
    "axes.edgecolor": "#2a3045",   "axes.labelcolor": "#f0f4ff",
    "xtick.color": "#f0f4ff",      "ytick.color": "#f0f4ff",
    "text.color": "#f0f4ff",       "grid.color": "#2a3045",
    "grid.alpha": 0.5,             "font.family": "monospace",
    "figure.dpi": 150,
})

# ── Feature columns (must match telemetry.js computeSessionFeatures output) ──

FEATURES = [
    "straightness_mean", "straightness_std",
    "dir_entropy_mean",  "dir_entropy_std",
    "vel_cv_mean",       "vel_cv_std",
    "vel_std_mean",      "accel_std_mean",
    "pre_dwell_mean",    "pre_dwell_std",
    "reaction_ms_mean",  "overshoot_mean",
    "idle_burst_mean",   "traj_points_mean",
    "arc_length_mean",
]

LABELS = {
    "straightness_mean":  "Path Straightness (μ)",
    "straightness_std":   "Path Straightness (σ)",
    "dir_entropy_mean":   "Direction Entropy (μ)",
    "dir_entropy_std":    "Direction Entropy (σ)",
    "vel_cv_mean":        "Velocity CV (μ)",
    "vel_cv_std":         "Velocity CV (σ)",
    "vel_std_mean":       "Velocity Std (μ)",
    "accel_std_mean":     "Acceleration Std (μ)",
    "pre_dwell_mean":     "Pre-click Dwell ms (μ)",
    "pre_dwell_std":      "Pre-click Dwell ms (σ)",
    "reaction_ms_mean":   "Reaction Time ms (μ)",
    "overshoot_mean":     "Overshoot Rate",
    "idle_burst_mean":    "Idle-Burst Ratio",
    "traj_points_mean":   "Trajectory Points (μ)",
    "arc_length_mean":    "Arc Length px (μ)",
}


# ══════════════════════════════════════════════════════════════════════════════
# 1. Data loading
# ══════════════════════════════════════════════════════════════════════════════

def load_csv(path):
    """Load CSV exported from /probe/export/csv (backend) or DataPanel."""
    df = pd.read_csv(path)
    print(f"Loaded: {len(df)} sessions from {path}")
    print(f"Columns: {list(df.columns)}")

    # Normalise column names (backend uses snake_case, frontend CSV may differ)
    rename = {
        "straightnessMean":  "straightness_mean",
        "straightnessStd":   "straightness_std",
        "dirEntropyMean":    "dir_entropy_mean",
        "dirEntropyStd":     "dir_entropy_std",
        "velCvMean":         "vel_cv_mean",
        "velCvStd":          "vel_cv_std",
        "velStdMean":        "vel_std_mean",
        "accelStdMean":      "accel_std_mean",
        "preDwellMean":      "pre_dwell_mean",
        "preDwellStd":       "pre_dwell_std",
        "reactionMsMean":    "reaction_ms_mean",
        "overshootMean":     "overshoot_mean",
        "idleBurstMean":     "idle_burst_mean",
        "trajPointsMean":    "traj_points_mean",
        "arcLengthMean":     "arc_length_mean",
        # backend CSV names
        "pre_dwell_mean":    "pre_dwell_mean",
        "combined_score":    "combined_score",
        "label_int":         "label_int",
    }
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})

    # Require label column
    if "label" not in df.columns:
        raise ValueError("CSV must have a 'label' column with values 'human' or 'rat'")

    # Filter to labelled rows only
    df = df[df["label"].isin(["human", "rat"])].copy()
    df["label_int"] = (df["label"] == "rat").astype(int)

    print(f"Labelled: {len(df)} sessions  "
          f"(human={sum(df['label']=='human')}, rat={sum(df['label']=='rat')})")

    if len(df) < 10:
        print("⚠️  Fewer than 10 labelled sessions — results will be unreliable.")
        print("   Collect more data before drawing conclusions.")

    # Fill missing feature columns with 0
    for col in FEATURES:
        if col not in df.columns:
            print(f"  Missing feature column '{col}' — filling with 0")
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    return df


def pull_from_server(base_url):
    """Download CSV directly from the backend API."""
    import urllib.request
    url = base_url.rstrip("/") + "/probe/export/csv"
    path = f"{OUT}/server_data.csv"
    print(f"Downloading from {url}...")
    urllib.request.urlretrieve(url, path)
    return path


# ══════════════════════════════════════════════════════════════════════════════
# 2. Feature analysis
# ══════════════════════════════════════════════════════════════════════════════

def analyze_features(df):
    """Print per-feature statistics and separation analysis."""
    h = df[df["label"] == "human"]
    r = df[df["label"] == "rat"]

    print("\n" + "="*80)
    print(f"{'Feature':<30} {'Human μ±σ':>20} {'RAT μ±σ':>20} {'Sep.':>8}")
    print("="*80)

    separations = {}
    for col in FEATURES:
        if col not in df.columns: continue
        hm, hs = h[col].mean(), h[col].std()
        rm, rs = r[col].mean(), r[col].std()
        # Cohen's d — standardized effect size
        pooled_std = np.sqrt((hs**2 + rs**2) / 2) + 1e-9
        d = abs(hm - rm) / pooled_std
        separations[col] = d
        print(f"  {col:<28} {hm:>8.3f}±{hs:<8.3f} {rm:>8.3f}±{rs:<8.3f} d={d:.2f}")

    print("="*80)
    best = sorted(separations.items(), key=lambda x: x[1], reverse=True)[:5]
    print(f"\nTop 5 most discriminative features (Cohen's d):")
    for name, d in best:
        bar = "█" * min(int(d * 5), 40)
        print(f"  {name:<30} d={d:.3f}  {bar}")
    return separations


# ══════════════════════════════════════════════════════════════════════════════
# 3. Plots
# ══════════════════════════════════════════════════════════════════════════════

PALETTE = {"human": "#4ade80", "rat": "#f87171"}

def plot_distributions(df):
    top_feats = ["dir_entropy_mean", "vel_cv_mean", "pre_dwell_mean",
                 "reaction_ms_mean", "straightness_mean", "accel_std_mean"]
    top_feats = [f for f in top_feats if f in df.columns]

    fig, axes = plt.subplots(2, 3, figsize=(14, 8))
    fig.suptitle("Feature Distributions: Human vs RAT (Real Data)", fontsize=13, y=1.01)

    for ax, feat in zip(axes.flatten(), top_feats):
        for label, color in PALETTE.items():
            vals = df[df["label"] == label][feat].dropna()
            ax.hist(vals, bins=15, alpha=0.7, color=color, label=label, edgecolor="none")
        ax.set_title(LABELS.get(feat, feat), fontsize=9)
        ax.set_xlabel("Value", fontsize=8)
        ax.legend(fontsize=8)
        ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(f"{OUT}/feature_distributions.png", bbox_inches="tight", facecolor="#0f1117")
    plt.close()
    print("Saved: feature_distributions.png")


def plot_scatter(df):
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    for label, color in PALETTE.items():
        sub = df[df["label"] == label]
        axes[0].scatter(sub.get("straightness_mean", 0), sub.get("dir_entropy_mean", 0),
                        c=color, alpha=0.7, s=50, label=label, edgecolors="none")
        axes[1].scatter(sub.get("vel_cv_mean", 0), sub.get("pre_dwell_mean", 0),
                        c=color, alpha=0.7, s=50, label=label, edgecolors="none")
    for ax, (xl, yl, t) in zip(axes, [
        ("Path Straightness (μ)", "Direction Entropy (μ)", "Straightness vs Entropy"),
        ("Velocity CV (μ)", "Pre-click Dwell ms (μ)", "Velocity Variability vs Dwell Time"),
    ]):
        ax.set_xlabel(xl, fontsize=10); ax.set_ylabel(yl, fontsize=10)
        ax.set_title(t, fontsize=11); ax.legend(fontsize=9); ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(f"{OUT}/feature_scatter.png", bbox_inches="tight", facecolor="#0f1117")
    plt.close()
    print("Saved: feature_scatter.png")


# ══════════════════════════════════════════════════════════════════════════════
# 4. Model training & evaluation
# ══════════════════════════════════════════════════════════════════════════════

def evaluate_model(name, pipeline, X, y, n_splits=5):
    """5-fold stratified CV with full metric suite."""
    n_splits = min(n_splits, min(sum(y==0), sum(y==1)))  # can't have more folds than samples per class
    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)

    scoring = ["accuracy", "f1", "roc_auc", "precision", "recall"]
    scores  = cross_validate(pipeline, X, y, cv=cv, scoring=scoring, return_train_score=False)

    # Collect all probabilities for ROC curve
    all_proba, all_true = [], []
    for tr, val in cv.split(X, y):
        pipeline.fit(X[tr], y[tr])
        proba = pipeline.predict_proba(X[val])[:, 1] if hasattr(pipeline, "predict_proba") \
                else pipeline.decision_function(X[val])
        all_proba.extend(proba)
        all_true.extend(y[val])

    fpr_arr, tpr_arr, _ = roc_curve(all_true, all_proba)

    # False positive rate at threshold 0.5
    all_pred = (np.array(all_proba) >= 0.5).astype(int)
    cm = confusion_matrix(all_true, all_pred)
    fpr_at_50 = cm[0, 1] / (cm[0, 0] + cm[0, 1] + 1e-9)

    return {
        "name":     name,
        "accuracy": scores["test_accuracy"],
        "f1":       scores["test_f1"],
        "auc":      scores["test_roc_auc"],
        "precision":scores["test_precision"],
        "recall":   scores["test_recall"],
        "fpr_at_50":fpr_at_50,
        "roc_fpr":  fpr_arr,
        "roc_tpr":  tpr_arr,
        "all_proba":np.array(all_proba),
        "all_true": np.array(all_true),
        "n_splits": n_splits,
    }


def train_models(X, y):
    models = {
        "Logistic Regression": Pipeline([
            ("scaler", StandardScaler()),
            ("clf",    LogisticRegression(max_iter=2000, random_state=42, C=1.0))
        ]),
        "Random Forest": Pipeline([
            ("clf", RandomForestClassifier(
                n_estimators=200, max_depth=8,
                min_samples_leaf=2, random_state=42
            ))
        ]),
    }
    results = {}
    for name, pipeline in models.items():
        print(f"  Training {name}...")
        res = evaluate_model(name, pipeline, X, y)
        results[name] = res
        print(f"    AUC={res['auc'].mean():.3f}±{res['auc'].std():.3f}  "
              f"F1={res['f1'].mean():.3f}±{res['f1'].std():.3f}  "
              f"Acc={res['accuracy'].mean():.3f}  "
              f"FPR@0.5={res['fpr_at_50']:.3f}")
    return models, results


def plot_roc(results):
    fig, ax = plt.subplots(figsize=(8, 7))
    ax.plot([0,1],[0,1],"--",color="#6b7fa3",linewidth=1,label="Random (AUC=0.50)")
    colors = ["#4ade80","#60a5fa"]
    for (name, res), color in zip(results.items(), colors):
        fpr, tpr, _ = roc_curve(res["all_true"], res["all_proba"])
        ax.plot(fpr, tpr, color=color, linewidth=2.5,
                label=f"{name}  AUC={res['auc'].mean():.3f}±{res['auc'].std():.3f}")
    ax.set_xlabel("False Positive Rate",fontsize=11); ax.set_ylabel("True Positive Rate",fontsize=11)
    ax.set_title("ROC Curves — 5-Fold CV (Real Data)",fontsize=13)
    ax.legend(fontsize=9,loc="lower right"); ax.grid(True,alpha=0.3)
    ax.set_xlim(-0.01,1.01); ax.set_ylim(-0.01,1.05)
    plt.tight_layout()
    plt.savefig(f"{OUT}/roc_curves.png",bbox_inches="tight",facecolor="#0f1117")
    plt.close(); print("Saved: roc_curves.png")


def plot_comparison(results):
    names   = list(results.keys())
    metrics = [("accuracy","Accuracy","#4ade80"),
               ("f1","F1 Score","#60a5fa"),
               ("auc","AUC-ROC","#fbbf24")]
    x, w = np.arange(len(names)), 0.25
    fig, ax = plt.subplots(figsize=(10, 6))
    for i, (metric, label, color) in enumerate(metrics):
        means = [results[n][metric].mean() for n in names]
        stds  = [results[n][metric].std()  for n in names]
        ax.bar(x + i*w, means, w, label=label, color=color, alpha=0.85, edgecolor="none")
        ax.errorbar(x + i*w, means, yerr=stds, fmt="none",
                    ecolor="#f0f4ff", elinewidth=1.5, capsize=4, alpha=0.7)
        for j, (m, s) in enumerate(zip(means, stds)):
            ax.annotate(f"{m:.3f}", xy=(x[j]+i*w, m), xytext=(0,3),
                        textcoords="offset points", ha="center", fontsize=8, color="#f0f4ff")
    ax.set_xticks(x + w); ax.set_xticklabels(names, fontsize=11)
    ax.set_ylim(0, 1.2); ax.set_ylabel("Score (5-fold CV)", fontsize=11)
    ax.set_title("Model Comparison — Real Data", fontsize=13)
    ax.legend(fontsize=10); ax.grid(axis="y", alpha=0.3)
    plt.tight_layout()
    plt.savefig(f"{OUT}/model_comparison.png",bbox_inches="tight",facecolor="#0f1117")
    plt.close(); print("Saved: model_comparison.png")


def plot_confusion_importance(df, X, y, trained_models):
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))

    # Confusion matrix from RF predictions
    rf_pipe = trained_models["Random Forest"]
    rf_pipe.fit(X, y)
    from sklearn.model_selection import cross_val_predict
    y_pred = cross_val_predict(rf_pipe, X, y,
                               cv=StratifiedKFold(min(5, min(sum(y==0), sum(y==1))), shuffle=True, random_state=42))
    cm = confusion_matrix(y, y_pred)
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
                xticklabels=["Human","RAT"], yticklabels=["Human","RAT"],
                ax=axes[0], cbar=False, linewidths=1,
                annot_kws={"size":14,"color":"#0f1117"})
    axes[0].set_xlabel("Predicted",fontsize=11); axes[0].set_ylabel("Actual",fontsize=11)
    axes[0].set_title("Confusion Matrix — Random Forest (CV)",fontsize=11)

    # Feature importance
    rf_clf = rf_pipe.named_steps["clf"]
    imps   = rf_clf.feature_importances_
    feat_names = [LABELS.get(f, f) for f in FEATURES if f in df.columns]
    imps_use   = imps[:len(feat_names)]
    idx = np.argsort(imps_use)[::-1][:10]
    colors = ["#fbbf24" if imps_use[i] > np.median(imps_use) else "#6b7fa3" for i in idx]
    axes[1].barh([feat_names[i] for i in idx[::-1]],
                 [imps_use[i] for i in idx[::-1]],
                 color=colors[::-1], edgecolor="none")
    axes[1].set_xlabel("Gini Importance",fontsize=11)
    axes[1].set_title("Top Feature Importance — Random Forest",fontsize=11)
    axes[1].grid(axis="x",alpha=0.3)

    plt.tight_layout()
    plt.savefig(f"{OUT}/confusion_importance.png",bbox_inches="tight",facecolor="#0f1117")
    plt.close(); print("Saved: confusion_importance.png")


# ══════════════════════════════════════════════════════════════════════════════
# 5. Save model + results
# ══════════════════════════════════════════════════════════════════════════════

def save_results(results, trained_models, df, X, y):
    # Retrain final models on full data for deployment
    for name, pipe in trained_models.items():
        pipe.fit(X, y)
        safe_name = name.lower().replace(" ", "_")
        joblib.dump(pipe, f"{OUT}/{safe_name}.joblib")
        print(f"Saved: {safe_name}.joblib")

    # JSON summary
    summary = {}
    for name, res in results.items():
        summary[name] = {
            k: {"mean": round(float(v.mean()), 4), "std": round(float(v.std()), 4)}
            for k, v in res.items() if hasattr(v, "mean") and v.ndim == 1 and k not in ("roc_fpr","roc_tpr","all_proba","all_true")
        }
        summary[name]["fpr_at_threshold_0.5"] = round(res["fpr_at_50"], 4)
        summary[name]["n_folds"] = res["n_splits"]

    summary["data_info"] = {
        "total_sessions": len(df),
        "human_sessions": int(sum(y == 0)),
        "rat_sessions":   int(sum(y == 1)),
        "n_features":     len([f for f in FEATURES if f in df.columns]),
    }

    with open(f"{OUT}/results_summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    print("Saved: results_summary.json")

    # Print final table
    print("\n" + "="*80)
    print(f"{'Model':<25} {'Accuracy':>10} {'F1':>10} {'AUC-ROC':>10} {'FPR@0.5':>10}")
    print("="*80)
    for name, res in results.items():
        print(f"{name:<25} "
              f"{res['accuracy'].mean():.4f}±{res['accuracy'].std():.3f}  "
              f"{res['f1'].mean():.4f}±{res['f1'].std():.3f}  "
              f"{res['auc'].mean():.4f}±{res['auc'].std():.3f}  "
              f"{res['fpr_at_50']:.4f}")
    print("="*80)


# ══════════════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Train RAT detection models on real data")
    parser.add_argument("--csv",  type=str, help="Path to CSV file")
    parser.add_argument("--url",  type=str, help="Backend URL to pull CSV from")
    parser.add_argument("--model",type=str, default="both", choices=["lr","rf","both"])
    args = parser.parse_args()

    if args.url:
        csv_path = pull_from_server(args.url)
    elif args.csv:
        csv_path = args.csv
    else:
        # Try default paths
        for p in ["ratprobe_labelled.csv", "data/ratprobe_labelled.csv",
                  "ml/data/ratprobe_labelled.csv"]:
            if os.path.exists(p): csv_path = p; break
        else:
            print("Error: provide --csv path or --url https://your-backend.railway.app")
            sys.exit(1)

    print(f"\n[1/6] Loading data from {csv_path}...")
    df = load_csv(csv_path)
    X  = df[[f for f in FEATURES if f in df.columns]].values
    y  = df["label_int"].values

    print("\n[2/6] Feature analysis...")
    separations = analyze_features(df)

    print("\n[3/6] Feature plots...")
    plot_distributions(df)
    plot_scatter(df)

    print("\n[4/6] Training models (5-fold CV)...")
    trained_models, results = train_models(X, y)

    print("\n[5/6] Result plots...")
    plot_roc(results)
    plot_comparison(results)
    plot_confusion_importance(df, X, y, trained_models)

    print("\n[6/6] Saving models and results...")
    save_results(results, trained_models, df, X, y)

    print(f"\n✓ All outputs saved to ./{OUT}/")
    print(f"  To use the model in your app:")
    print(f"  >>> import joblib")
    print(f"  >>> model = joblib.load('{OUT}/random_forest.joblib')")
    print(f"  >>> model.predict([[straightness, entropy, vel_cv, ...]])")


if __name__ == "__main__":
    main()