package com.rat_probe.server.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Stores one complete CAPTCHA interaction session.
 * One record = one transfer attempt = one behavioral biometric sample.
 *
 * sessionJson stores the full BehaviorSample[] array as a JSON string,
 * allowing full feature re-extraction later without data loss.
 */
@Entity
@Table(name = "probe_session")
public class ProbeSession {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String username;

    private LocalDateTime timestamp;

    private Integer combinedScore;

    private Integer ambientScore;

    private Integer captchaScore;

    // "human", "rat", or null (unlabelled)
    private String label;

    // Comma-separated flag names from the probe
    private String flags;

    // for re-running feature engineering later
    @Lob
    @Column(columnDefinition = "TEXT")
    private String sessionJson;

    // Pre-computed scalar features (denormalized for fast ML training queries)
    // These are just examples - the actual features can be changed as needed.
    // In a real implementation, you might want to store these in a separate table or as a JSON blob,
    // especially if there are many features or they change frequently.
    // Example features - these should match what your ML model expects
    // (In a real implementation, you would compute these from the sessionJson data)

    private Double straightnessMean;
    private Double straightnessStd;
    private Double dirEntropyMean;
    private Double dirEntropyStd;
    private Double velCvMean;
    private Double velCvStd;
    private Double velStdMean;
    private Double accelStdMean;
    private Double preDwellMean;
    private Double preDwellStd;
    private Double reactionMsMean;
    private Double overshootMean;
    private Double idleBurstMean;
    private Double trajPointsMean;
    private Double arcLengthMean;
    // Desvice and network data
    private String deviceOs;
    private String deviceBrowser;
    private String screenResolution;
    private Double devicePixelRatio;
    private Integer networkLatencyMs;

    public ProbeSession() {
        this.timestamp = LocalDateTime.now();
    }

    // ==== Getters & Setters =====

    public String getId() { return id; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }

    public Integer getCombinedScore() { return combinedScore; }
    public void setCombinedScore(Integer combinedScore) { this.combinedScore = combinedScore; }

    public Integer getAmbientScore() { return ambientScore; }
    public void setAmbientScore(Integer ambientScore) { this.ambientScore = ambientScore; }

    public Integer getCaptchaScore() { return captchaScore; }
    public void setCaptchaScore(Integer captchaScore) { this.captchaScore = captchaScore; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public String getFlags() { return flags; }
    public void setFlags(String flags) { this.flags = flags; }

    public String getSessionJson() { return sessionJson; }
    public void setSessionJson(String sessionJson) { this.sessionJson = sessionJson; }

    public Double getStraightnessMean() { return straightnessMean; }
    public void setStraightnessMean(Double v) { this.straightnessMean = v; }

    public Double getStraightnessStd() { return straightnessStd; }
    public void setStraightnessStd(Double v) { this.straightnessStd = v; }

    public Double getDirEntropyMean() { return dirEntropyMean; }
    public void setDirEntropyMean(Double v) { this.dirEntropyMean = v; }

    public Double getDirEntropyStd() { return dirEntropyStd; }
    public void setDirEntropyStd(Double v) { this.dirEntropyStd = v; }

    public Double getVelCvMean() { return velCvMean; }
    public void setVelCvMean(Double v) { this.velCvMean = v; }

    public Double getVelCvStd() { return velCvStd; }
    public void setVelCvStd(Double v) { this.velCvStd = v; }

    public Double getVelStdMean() { return velStdMean; }
    public void setVelStdMean(Double v) { this.velStdMean = v; }

    public Double getAccelStdMean() { return accelStdMean; }
    public void setAccelStdMean(Double v) { this.accelStdMean = v; }

    public Double getPreDwellMean() { return preDwellMean; }
    public void setPreDwellMean(Double v) { this.preDwellMean = v; }

    public Double getPreDwellStd() { return preDwellStd; }
    public void setPreDwellStd(Double v) { this.preDwellStd = v; }

    public Double getReactionMsMean() { return reactionMsMean; }
    public void setReactionMsMean(Double v) { this.reactionMsMean = v; }

    public Double getOvershootMean() { return overshootMean; }
    public void setOvershootMean(Double v) { this.overshootMean = v; }

    public Double getIdleBurstMean() { return idleBurstMean; }
    public void setIdleBurstMean(Double v) { this.idleBurstMean = v; }

    public Double getTrajPointsMean() { return trajPointsMean; }
    public void setTrajPointsMean(Double v) { this.trajPointsMean = v; }

    public Double getArcLengthMean() { return arcLengthMean; }
    public void setArcLengthMean(Double v) { this.arcLengthMean = v; }

    public String getDeviceOs() { return deviceOs; }
    public void setDeviceOs(String deviceOs) { this.deviceOs = deviceOs; }

    public String getDeviceBrowser() { return deviceBrowser; }
    public void setDeviceBrowser(String deviceBrowser) { this.deviceBrowser = deviceBrowser; }

    public String getScreenResolution() { return screenResolution; }
    public void setScreenResolution(String screenResolution) { this.screenResolution = screenResolution; }

    public Double getDevicePixelRatio() { return devicePixelRatio; }
    public void setDevicePixelRatio(Double devicePixelRatio) { this.devicePixelRatio = devicePixelRatio; }

    public Integer getNetworkLatencyMs() { return networkLatencyMs; }
    public void setNetworkLatencyMs(Integer networkLatencyMs) { this.networkLatencyMs = networkLatencyMs; }

}