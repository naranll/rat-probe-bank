package com.rat_probe.server.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * TrialRecord — one row per individual trial of the active-challenge game.
 * Updated to include all §22.12 features plus fixes from analysis sessions.
 */
@Entity
@Table(
    name = "trial_record",
    indexes = {
        @Index(name = "idx_trial_participant",     columnList = "participantId"),
        @Index(name = "idx_trial_condition",        columnList = "condition"),
        @Index(name = "idx_trial_participant_cond", columnList = "participantId,condition"),
        @Index(name = "idx_trial_label",            columnList = "label")
    }
)
public class TrialRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // ── Identifiers ────────────────────────────────────────────────────────
    private String  sessionId;
    private String  participantId;
    private String  condition;       // "local" | "remote"
    private String  trialType;       // "practice" | "formal"
    private Integer trialId;
    private LocalDateTime timestamp;

    // ── Audit trail ────────────────────────────────────────────────────────
    private String  username;
    private String  transferTo;
    private Double  transferAmount;

    // ── Trial outcome ──────────────────────────────────────────────────────
    private Integer durationMs;
    private Boolean collisionFlag;
    private String  collisionSide;
    private Integer totalClicks;
    private Integer totalFrames;

    // ── Risk aggregates ────────────────────────────────────────────────────
    private Integer danger1DurationMs;
    private Integer danger2DurationMs;
    private Double  avgRiskScore;
    private Integer maxRiskScore;

    // ── §22.12 A — Boundary risk ───────────────────────────────────────────
    private Double  survivalTimeMs;       // duration_ms as ML feature
    private Integer collisionOccurred;    // 0/1 as ML feature
    private Double  minDistanceToWallMean;
    private Double  minDistanceToWallMin;
    private Double  danger1Ratio;
    private Double  danger2Ratio;
    private Integer dangerEntryCount;
    private Double  dangerVisitDurationMean;  // avg ms per danger visit

    // ── §22.12 B — Reaction latency ────────────────────────────────────────
    private Double  dangerResponseLatencyMean;
    private Double  dangerResponseLatencyStd;
    private Double  dangerResponseLatencyMax;
    private Double  secondClickLatencyMean;   // inter-click interval during danger
    private Double  secondClickLatencyStd;
    private Double  recoveryTimeMean;

    // ── §22.12 C — Overshoot (rewritten) ──────────────────────────────────
    private Integer overshootCount;
    private Double  overshootAmplitudeMean;
    private Double  overshootAmplitudeMax;

    // ── §22.12 D — Oscillation ─────────────────────────────────────────────
    private Integer dirChangeCount;
    private Integer dangerSideSwitchCount;    // wall-side switches during danger
    private Integer highFreqClickCount;
    private Integer clickBurstCount;
    private Double  headingVariance;
    private Double  frameIntervalJitterMs;   // std of rAF frame-to-frame gaps
    private Double  clickIntervalJitterMs;   // std of click-to-click gaps (RAT-sensitive)

    // ── §22.12 E — Control efficiency ─────────────────────────────────────
    private Double  clickRate;
    private Double  effectiveClickRatio;      // redefined: toward-centre clicks
    private Double  ineffectiveClickRatio;
    private Double  riskDropPerClickMean;
    private Integer worseningClickCount;      // clicks that made danger worse
    private Double  worseningClickRatio;
    private Double  anticipatoryClickRatio;   // safe-zone preventive clicks

    // ── Label ──────────────────────────────────────────────────────────────
    private String  label;   // "local" | "remote" | null

    // ── Device / network ───────────────────────────────────────────────────
    private String  deviceOs;
    private String  deviceBrowser;
    private String  screenResolution;
    private Double  devicePixelRatio;
    private Integer networkLatencyMs;

    // ── Raw logs ───────────────────────────────────────────────────────────
    // NOTE: @Lob is intentionally NOT used here.
    // On PostgreSQL, @Lob String maps to OID (large object) which requires
    // a special LOB locator and breaks Jackson serialisation on GET requests.
    // Plain @Column(columnDefinition="TEXT") works correctly on both H2 and PostgreSQL.
    @Column(columnDefinition = "TEXT")
    private String frameLogsJson;

    @Column(columnDefinition = "TEXT")
    private String clickLogsJson;

    public TrialRecord() { this.timestamp = LocalDateTime.now(); }

    // ─── Getters & Setters ─────────────────────────────────────────────────
    public String getId()                              { return id; }

    public String getSessionId()                       { return sessionId; }
    public void   setSessionId(String v)               { this.sessionId = v; }

    public String getParticipantId()                   { return participantId; }
    public void   setParticipantId(String v)           { this.participantId = v; }

    public String getCondition()                       { return condition; }
    public void   setCondition(String v)               { this.condition = v; }

    public String getTrialType()                       { return trialType; }
    public void   setTrialType(String v)               { this.trialType = v; }

    public Integer getTrialId()                        { return trialId; }
    public void    setTrialId(Integer v)               { this.trialId = v; }

    public LocalDateTime getTimestamp()                { return timestamp; }
    public void          setTimestamp(LocalDateTime v) { this.timestamp = v; }

    public String getUsername()                        { return username; }
    public void   setUsername(String v)                { this.username = v; }

    public String getTransferTo()                      { return transferTo; }
    public void   setTransferTo(String v)              { this.transferTo = v; }

    public Double getTransferAmount()                  { return transferAmount; }
    public void   setTransferAmount(Double v)          { this.transferAmount = v; }

    public Integer getDurationMs()                     { return durationMs; }
    public void    setDurationMs(Integer v)            { this.durationMs = v; }

    public Boolean getCollisionFlag()                  { return collisionFlag; }
    public void    setCollisionFlag(Boolean v)         { this.collisionFlag = v; }

    public String getCollisionSide()                   { return collisionSide; }
    public void   setCollisionSide(String v)           { this.collisionSide = v; }

    public Integer getTotalClicks()                    { return totalClicks; }
    public void    setTotalClicks(Integer v)           { this.totalClicks = v; }

    public Integer getTotalFrames()                    { return totalFrames; }
    public void    setTotalFrames(Integer v)           { this.totalFrames = v; }

    public Integer getDanger1DurationMs()              { return danger1DurationMs; }
    public void    setDanger1DurationMs(Integer v)     { this.danger1DurationMs = v; }

    public Integer getDanger2DurationMs()              { return danger2DurationMs; }
    public void    setDanger2DurationMs(Integer v)     { this.danger2DurationMs = v; }

    public Double getAvgRiskScore()                    { return avgRiskScore; }
    public void   setAvgRiskScore(Double v)            { this.avgRiskScore = v; }

    public Integer getMaxRiskScore()                   { return maxRiskScore; }
    public void    setMaxRiskScore(Integer v)          { this.maxRiskScore = v; }

    public Double getSurvivalTimeMs()                  { return survivalTimeMs; }
    public void   setSurvivalTimeMs(Double v)          { this.survivalTimeMs = v; }

    public Integer getCollisionOccurred()              { return collisionOccurred; }
    public void    setCollisionOccurred(Integer v)     { this.collisionOccurred = v; }

    public Double getMinDistanceToWallMean()           { return minDistanceToWallMean; }
    public void   setMinDistanceToWallMean(Double v)   { this.minDistanceToWallMean = v; }

    public Double getMinDistanceToWallMin()            { return minDistanceToWallMin; }
    public void   setMinDistanceToWallMin(Double v)    { this.minDistanceToWallMin = v; }

    public Double getDanger1Ratio()                    { return danger1Ratio; }
    public void   setDanger1Ratio(Double v)            { this.danger1Ratio = v; }

    public Double getDanger2Ratio()                    { return danger2Ratio; }
    public void   setDanger2Ratio(Double v)            { this.danger2Ratio = v; }

    public Integer getDangerEntryCount()               { return dangerEntryCount; }
    public void    setDangerEntryCount(Integer v)      { this.dangerEntryCount = v; }

    public Double getDangerVisitDurationMean()         { return dangerVisitDurationMean; }
    public void   setDangerVisitDurationMean(Double v) { this.dangerVisitDurationMean = v; }

    public Double getDangerResponseLatencyMean()       { return dangerResponseLatencyMean; }
    public void   setDangerResponseLatencyMean(Double v){ this.dangerResponseLatencyMean = v; }

    public Double getDangerResponseLatencyStd()        { return dangerResponseLatencyStd; }
    public void   setDangerResponseLatencyStd(Double v){ this.dangerResponseLatencyStd = v; }

    public Double getDangerResponseLatencyMax()        { return dangerResponseLatencyMax; }
    public void   setDangerResponseLatencyMax(Double v){ this.dangerResponseLatencyMax = v; }

    public Double getSecondClickLatencyMean()          { return secondClickLatencyMean; }
    public void   setSecondClickLatencyMean(Double v)  { this.secondClickLatencyMean = v; }

    public Double getSecondClickLatencyStd()           { return secondClickLatencyStd; }
    public void   setSecondClickLatencyStd(Double v)   { this.secondClickLatencyStd = v; }

    public Double getRecoveryTimeMean()                { return recoveryTimeMean; }
    public void   setRecoveryTimeMean(Double v)        { this.recoveryTimeMean = v; }

    public Integer getOvershootCount()                 { return overshootCount; }
    public void    setOvershootCount(Integer v)        { this.overshootCount = v; }

    public Double getOvershootAmplitudeMean()          { return overshootAmplitudeMean; }
    public void   setOvershootAmplitudeMean(Double v)  { this.overshootAmplitudeMean = v; }

    public Double getOvershootAmplitudeMax()           { return overshootAmplitudeMax; }
    public void   setOvershootAmplitudeMax(Double v)   { this.overshootAmplitudeMax = v; }

    public Integer getDirChangeCount()                 { return dirChangeCount; }
    public void    setDirChangeCount(Integer v)        { this.dirChangeCount = v; }

    public Integer getDangerSideSwitchCount()          { return dangerSideSwitchCount; }
    public void    setDangerSideSwitchCount(Integer v) { this.dangerSideSwitchCount = v; }

    public Integer getHighFreqClickCount()             { return highFreqClickCount; }
    public void    setHighFreqClickCount(Integer v)    { this.highFreqClickCount = v; }

    public Integer getClickBurstCount()                { return clickBurstCount; }
    public void    setClickBurstCount(Integer v)       { this.clickBurstCount = v; }

    public Double getHeadingVariance()                 { return headingVariance; }
    public void   setHeadingVariance(Double v)         { this.headingVariance = v; }

    public Double getFrameIntervalJitterMs()           { return frameIntervalJitterMs; }
    public void   setFrameIntervalJitterMs(Double v)   { this.frameIntervalJitterMs = v; }

    public Double getClickIntervalJitterMs()           { return clickIntervalJitterMs; }
    public void   setClickIntervalJitterMs(Double v)   { this.clickIntervalJitterMs = v; }

    public Double getClickRate()                       { return clickRate; }
    public void   setClickRate(Double v)               { this.clickRate = v; }

    public Double getEffectiveClickRatio()             { return effectiveClickRatio; }
    public void   setEffectiveClickRatio(Double v)     { this.effectiveClickRatio = v; }

    public Double getIneffectiveClickRatio()           { return ineffectiveClickRatio; }
    public void   setIneffectiveClickRatio(Double v)   { this.ineffectiveClickRatio = v; }

    public Double getRiskDropPerClickMean()            { return riskDropPerClickMean; }
    public void   setRiskDropPerClickMean(Double v)    { this.riskDropPerClickMean = v; }

    public Integer getWorseningClickCount()            { return worseningClickCount; }
    public void    setWorseningClickCount(Integer v)   { this.worseningClickCount = v; }

    public Double getWorseningClickRatio()             { return worseningClickRatio; }
    public void   setWorseningClickRatio(Double v)     { this.worseningClickRatio = v; }

    public Double getAnticipatoryClickRatio()          { return anticipatoryClickRatio; }
    public void   setAnticipatoryClickRatio(Double v)  { this.anticipatoryClickRatio = v; }

    public String getLabel()                           { return label; }
    public void   setLabel(String v)                   { this.label = v; }

    public String getDeviceOs()                        { return deviceOs; }
    public void   setDeviceOs(String v)                { this.deviceOs = v; }

    public String getDeviceBrowser()                   { return deviceBrowser; }
    public void   setDeviceBrowser(String v)           { this.deviceBrowser = v; }

    public String getScreenResolution()                { return screenResolution; }
    public void   setScreenResolution(String v)        { this.screenResolution = v; }

    public Double getDevicePixelRatio()                { return devicePixelRatio; }
    public void   setDevicePixelRatio(Double v)        { this.devicePixelRatio = v; }

    public Integer getNetworkLatencyMs()               { return networkLatencyMs; }
    public void    setNetworkLatencyMs(Integer v)      { this.networkLatencyMs = v; }

    public String getFrameLogsJson()                   { return frameLogsJson; }
    public void   setFrameLogsJson(String v)           { this.frameLogsJson = v; }

    public String getClickLogsJson()                   { return clickLogsJson; }
    public void   setClickLogsJson(String v)           { this.clickLogsJson = v; }
}