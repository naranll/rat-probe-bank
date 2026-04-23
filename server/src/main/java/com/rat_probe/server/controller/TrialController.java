package com.rat_probe.server.controller;

import com.rat_probe.server.model.TrialRecord;
import com.rat_probe.server.repository.TrialRecordRepository;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * TrialController — all endpoints for MiniGame experiment data.
 *
 *   POST  /trials/batch
 *   GET   /trials                     ?participantId= &condition=
 *   GET   /trials/session/{sessionId}
 *   PATCH /trials/{id}/label
 *   POST  /trials/bulk-label
 *   GET   /trials/stats
 *   GET   /trials/participants
 *   GET   /trials/export/csv          formal only
 *   GET   /trials/export/csv/all
 *   GET   /trials/export/csv/participant?participantId=
 */
@RestController
@RequestMapping("/trials")
@CrossOrigin("*")
public class TrialController {

    private final TrialRecordRepository repo;
    public TrialController(TrialRecordRepository repo) { this.repo = repo; }

    // ── Batch save ────────────────────────────────────────────────────────────
    @PostMapping("/batch")
    public ResponseEntity<Map<String, Object>> saveBatch(@RequestBody Map<String, Object> body) {
        String  sessionId      = str(body, "sessionId");
        String  participantId  = str(body, "participantId");
        String  condition      = str(body, "condition");
        String  username       = str(body, "username");
        String  transferTo     = str(body, "transferTo");
        Double  transferAmount = dbl(body, "transferAmount");
        String  deviceOs       = str(body, "deviceOs");
        String  deviceBrowser  = str(body, "deviceBrowser");
        String  screenRes      = str(body, "screenResolution");
        Double  dpr            = dbl(body, "devicePixelRatio");
        Integer netLatency     = intVal(body, "networkLatencyMs");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> trials = (List<Map<String, Object>>) body.get("trials");
        if (trials == null || trials.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("error", "trials array required"));

        List<String> savedIds = new ArrayList<>();

        for (Map<String, Object> t : trials) {
            TrialRecord r = new TrialRecord();

            r.setSessionId(sessionId);
            r.setParticipantId(participantId);
            r.setCondition(condition);
            r.setTrialType(str(t, "trialType"));
            r.setTrialId(intVal(t, "trialId"));
            r.setUsername(username);
            r.setTransferTo(transferTo);
            r.setTransferAmount(transferAmount);

            r.setDurationMs(intVal(t, "durationMs"));
            r.setCollisionFlag(bool(t, "collisionFlag"));
            r.setCollisionSide(str(t, "collisionSide"));
            r.setTotalClicks(intVal(t, "totalClicks"));
            r.setTotalFrames(intVal(t, "totalFrames"));
            r.setDanger1DurationMs(intVal(t, "danger1DurationMs"));
            r.setDanger2DurationMs(intVal(t, "danger2DurationMs"));
            r.setAvgRiskScore(dbl(t, "avgRiskScore"));
            r.setMaxRiskScore(intVal(t, "maxRiskScore"));

            @SuppressWarnings("unchecked")
            Map<String, Object> f = (Map<String, Object>) t.get("features");
            if (f != null) {
                // A
                r.setSurvivalTimeMs(dbl(f, "survivalTimeMs"));
                r.setCollisionOccurred(intVal(f, "collisionOccurred"));
                r.setMinDistanceToWallMean(dbl(f, "minDistanceToWallMean"));
                r.setMinDistanceToWallMin(dbl(f, "minDistanceToWallMin"));
                r.setDanger1Ratio(dbl(f, "danger1Ratio"));
                r.setDanger2Ratio(dbl(f, "danger2Ratio"));
                r.setDangerEntryCount(intVal(f, "dangerEntryCount"));
                r.setDangerVisitDurationMean(dbl(f, "dangerVisitDurationMean"));
                // B
                r.setDangerResponseLatencyMean(dbl(f, "dangerResponseLatencyMean"));
                r.setDangerResponseLatencyStd(dbl(f, "dangerResponseLatencyStd"));
                r.setDangerResponseLatencyMax(dbl(f, "dangerResponseLatencyMax"));
                r.setSecondClickLatencyMean(dbl(f, "secondClickLatencyMean"));
                r.setSecondClickLatencyStd(dbl(f, "secondClickLatencyStd"));
                r.setRecoveryTimeMean(dbl(f, "recoveryTimeMean"));
                // C
                r.setOvershootCount(intVal(f, "overshootCount"));
                r.setOvershootAmplitudeMean(dbl(f, "overshootAmplitudeMean"));
                r.setOvershootAmplitudeMax(dbl(f, "overshootAmplitudeMax"));
                // D
                r.setDirChangeCount(intVal(f, "dirChangeCount"));
                r.setDangerSideSwitchCount(intVal(f, "dangerSideSwitchCount"));
                r.setHighFreqClickCount(intVal(f, "highFreqClickCount"));
                r.setClickBurstCount(intVal(f, "clickBurstCount"));
                r.setHeadingVariance(dbl(f, "headingVariance"));
                r.setFrameIntervalJitterMs(dbl(f, "frameIntervalJitterMs"));
                r.setClickIntervalJitterMs(dbl(f, "clickIntervalJitterMs"));
                // E
                r.setClickRate(dbl(f, "clickRate"));
                r.setEffectiveClickRatio(dbl(f, "effectiveClickRatio"));
                r.setIneffectiveClickRatio(dbl(f, "ineffectiveClickRatio"));
                r.setRiskDropPerClickMean(dbl(f, "riskDropPerClickMean"));
                r.setWorseningClickCount(intVal(f, "worseningClickCount"));
                r.setWorseningClickRatio(dbl(f, "worseningClickRatio"));
                r.setAnticipatoryClickRatio(dbl(f, "anticipatoryClickRatio"));
            }

            r.setDeviceOs(deviceOs);
            r.setDeviceBrowser(deviceBrowser);
            r.setScreenResolution(screenRes);
            r.setDevicePixelRatio(dpr);
            r.setNetworkLatencyMs(netLatency);
            r.setFrameLogsJson(str(t, "frameLogsJson"));
            r.setClickLogsJson(str(t, "clickLogsJson"));
            r.setLabel(str(t, "label"));

            repo.save(r);
            savedIds.add(r.getId());
        }

        return ResponseEntity.ok(Map.of(
            "status", "saved", "sessionId", sessionId == null ? "" : sessionId,
            "participantId", participantId == null ? "" : participantId,
            "condition", condition == null ? "" : condition,
            "trialsSaved", savedIds.size(), "ids", savedIds
        ));
    }

    // ── Listing ───────────────────────────────────────────────────────────────
    @GetMapping
    public List<TrialRecord> list(
            @RequestParam(required = false) String participantId,
            @RequestParam(required = false) String condition) {
        if (participantId != null && condition != null)
            return repo.findByParticipantIdAndConditionOrderByTrialIdAsc(participantId, condition);
        if (participantId != null)
            return repo.findByParticipantIdOrderByTimestampAsc(participantId);
        if (condition != null)
            return repo.findByConditionOrderByTimestampDesc(condition);
        return repo.findAllByOrderByTimestampDesc();
    }

    @GetMapping("/session/{sessionId}")
    public List<TrialRecord> bySession(@PathVariable String sessionId) {
        return repo.findBySessionIdOrderByTrialIdAsc(sessionId);
    }

    // ── Labelling ─────────────────────────────────────────────────────────────
    @PatchMapping("/{id}/label")
    public ResponseEntity<Map<String, String>> label(
            @PathVariable String id, @RequestBody Map<String, String> body) {
        TrialRecord r = repo.findById(id)
            .orElseThrow(() -> new RuntimeException("Trial not found: " + id));
        r.setLabel(body.get("label"));
        repo.save(r);
        return ResponseEntity.ok(Map.of("status", "labelled", "label", body.get("label")));
    }

    @PostMapping("/bulk-label")
    public ResponseEntity<Map<String, Object>> bulkLabel(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<String> ids = (List<String>) body.get("ids");
        String label = (String) body.get("label");
        if (ids == null || label == null)
            return ResponseEntity.badRequest().body(Map.of("error", "ids and label required"));
        int count = 0;
        for (String id : ids) {
            repo.findById(id).ifPresent(r -> { r.setLabel(label); repo.save(r); });
            count++;
        }
        return ResponseEntity.ok(Map.of("status", "bulk labelled", "count", count, "label", label));
    }

    // ── Stats ─────────────────────────────────────────────────────────────────
    @GetMapping("/stats")
    public Map<String, Object> stats() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total",        repo.count());
        out.put("formal",       repo.countByTrialType("formal"));
        out.put("practice",     repo.countByTrialType("practice"));
        out.put("localFormal",  repo.countByConditionAndTrialType("local", "formal"));
        out.put("remoteFormal", repo.countByConditionAndTrialType("remote", "formal"));
        out.put("labelled",     repo.countByLabel("local") + repo.countByLabel("remote"));
        out.put("unlabelled",   repo.count() - (long)(out.get("labelled")));
        out.put("participants", repo.findDistinctParticipants().size());
        return out;
    }

    @GetMapping("/participants")
    public List<Map<String, Object>> participants() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String pid : repo.findDistinctParticipants()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("participantId", pid);
            row.put("localTrials",   repo.countByParticipantIdAndCondition(pid, "local"));
            row.put("remoteTrials",  repo.countByParticipantIdAndCondition(pid, "remote"));
            out.add(row);
        }
        return out;
    }

    // ── CSV export ────────────────────────────────────────────────────────────
    @GetMapping("/export/csv")
    public ResponseEntity<byte[]> exportFormal() {
        return buildCsv(repo.findAllFormalForExport(), "trials_formal.csv");
    }

    @GetMapping("/export/csv/all")
    public ResponseEntity<byte[]> exportAll() {
        return buildCsv(repo.findAllByOrderByTimestampDesc(), "trials_all.csv");
    }

    @GetMapping("/export/csv/participant")
    public ResponseEntity<byte[]> exportParticipant(@RequestParam String participantId) {
        return buildCsv(repo.findFormalByParticipant(participantId),
                        "trials_" + participantId + ".csv");
    }

    private ResponseEntity<byte[]> buildCsv(List<TrialRecord> rows, String filename) {
        StringBuilder sb = new StringBuilder();
        sb.append("id,session_id,participant_id,condition,trial_type,trial_id,timestamp,")
          .append("label,label_int,username,")
          .append("duration_ms,collision_flag,collision_side,total_clicks,total_frames,")
          .append("danger1_duration_ms,danger2_duration_ms,avg_risk_score,max_risk_score,")
          // A
          .append("survival_time_ms,collision_occurred,")
          .append("min_distance_to_wall_mean,min_distance_to_wall_min,")
          .append("danger1_ratio,danger2_ratio,danger_entry_count,danger_visit_duration_mean,")
          // B
          .append("danger_response_latency_mean,danger_response_latency_std,danger_response_latency_max,")
          .append("second_click_latency_mean,second_click_latency_std,recovery_time_mean,")
          // C
          .append("overshoot_count,overshoot_amplitude_mean,overshoot_amplitude_max,")
          // D
          .append("dir_change_count,danger_side_switch_count,")
          .append("high_freq_click_count,click_burst_count,heading_variance,")
          .append("frame_interval_jitter_ms,click_interval_jitter_ms,")
          // E
          .append("click_rate,effective_click_ratio,ineffective_click_ratio,risk_drop_per_click_mean,")
          .append("worsening_click_count,worsening_click_ratio,anticipatory_click_ratio,")
          // device
          .append("device_os,device_browser,screen_resolution,device_pixel_ratio,network_latency_ms\n");

        DateTimeFormatter fmt = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

        for (TrialRecord r : rows) {
            sb.append(q(r.getId())).append(",")
              .append(q(r.getSessionId())).append(",")
              .append(q(r.getParticipantId())).append(",")
              .append(q(r.getCondition())).append(",")
              .append(q(r.getTrialType())).append(",")
              .append(safe(r.getTrialId())).append(",")
              .append(r.getTimestamp() != null ? r.getTimestamp().format(fmt) : "").append(",")
              .append(q(r.getLabel())).append(",")
              .append("remote".equals(r.getLabel()) ? "1" : "local".equals(r.getLabel()) ? "0" : "").append(",")
              .append(q(r.getUsername())).append(",")
              .append(safe(r.getDurationMs())).append(",")
              .append(safe(r.getCollisionFlag())).append(",")
              .append(q(r.getCollisionSide())).append(",")
              .append(safe(r.getTotalClicks())).append(",")
              .append(safe(r.getTotalFrames())).append(",")
              .append(safe(r.getDanger1DurationMs())).append(",")
              .append(safe(r.getDanger2DurationMs())).append(",")
              .append(safe(r.getAvgRiskScore())).append(",")
              .append(safe(r.getMaxRiskScore())).append(",")
              // A
              .append(safe(r.getSurvivalTimeMs())).append(",")
              .append(safe(r.getCollisionOccurred())).append(",")
              .append(safe(r.getMinDistanceToWallMean())).append(",")
              .append(safe(r.getMinDistanceToWallMin())).append(",")
              .append(safe(r.getDanger1Ratio())).append(",")
              .append(safe(r.getDanger2Ratio())).append(",")
              .append(safe(r.getDangerEntryCount())).append(",")
              .append(safe(r.getDangerVisitDurationMean())).append(",")
              // B
              .append(safe(r.getDangerResponseLatencyMean())).append(",")
              .append(safe(r.getDangerResponseLatencyStd())).append(",")
              .append(safe(r.getDangerResponseLatencyMax())).append(",")
              .append(safe(r.getSecondClickLatencyMean())).append(",")
              .append(safe(r.getSecondClickLatencyStd())).append(",")
              .append(safe(r.getRecoveryTimeMean())).append(",")
              // C
              .append(safe(r.getOvershootCount())).append(",")
              .append(safe(r.getOvershootAmplitudeMean())).append(",")
              .append(safe(r.getOvershootAmplitudeMax())).append(",")
              // D
              .append(safe(r.getDirChangeCount())).append(",")
              .append(safe(r.getDangerSideSwitchCount())).append(",")
              .append(safe(r.getHighFreqClickCount())).append(",")
              .append(safe(r.getClickBurstCount())).append(",")
              .append(safe(r.getHeadingVariance())).append(",")
              .append(safe(r.getFrameIntervalJitterMs())).append(",")
              .append(safe(r.getClickIntervalJitterMs())).append(",")
              // E
              .append(safe(r.getClickRate())).append(",")
              .append(safe(r.getEffectiveClickRatio())).append(",")
              .append(safe(r.getIneffectiveClickRatio())).append(",")
              .append(safe(r.getRiskDropPerClickMean())).append(",")
              .append(safe(r.getWorseningClickCount())).append(",")
              .append(safe(r.getWorseningClickRatio())).append(",")
              .append(safe(r.getAnticipatoryClickRatio())).append(",")
              // device
              .append(q(r.getDeviceOs())).append(",")
              .append(q(r.getDeviceBrowser())).append(",")
              .append(q(r.getScreenResolution())).append(",")
              .append(safe(r.getDevicePixelRatio())).append(",")
              .append(safe(r.getNetworkLatencyMs())).append("\n");
        }

        byte[] bytes = sb.toString().getBytes();
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
            .contentType(MediaType.parseMediaType("text/csv"))
            .body(bytes);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private String q(String v)              { return v == null ? "" : "\"" + v.replace("\"","\"\"") + "\""; }
    private String safe(Object v)           { return v == null ? "" : String.valueOf(v); }
    private String str(Map<String,Object> m, String k) { Object v = m.get(k); return v == null ? null : String.valueOf(v); }
    private Integer intVal(Map<String,Object> m, String k) {
        Object v = m.get(k); if (v == null) return null;
        if (v instanceof Integer) return (Integer) v;
        if (v instanceof Number)  return ((Number)v).intValue();
        try { return Integer.parseInt(String.valueOf(v)); } catch (Exception e) { return null; }
    }
    
    private Double dbl(Map<String,Object> m, String k) {
        Object v = m.get(k); if (v == null) return null;
        if (v instanceof Double) return (Double) v;
        if (v instanceof Number) return ((Number)v).doubleValue();
        try { return Double.parseDouble(String.valueOf(v)); } catch (Exception e) { return null; }
    }

    private Boolean bool(Map<String,Object> m, String k) {
        Object v = m.get(k); if (v == null) return null;
        if (v instanceof Boolean) return (Boolean) v;
        String s = String.valueOf(v).toLowerCase();
        return "true".equals(s) || "1".equals(s);
    }
}