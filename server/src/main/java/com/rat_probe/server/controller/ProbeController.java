package com.rat_probe.server.controller;

import com.rat_probe.server.model.ProbeSession;
import com.rat_probe.server.repository.ProbeSessionRepository;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * Endpoints:
 *   POST /probe/session                — save one session from frontend
 *   PATCH /probe/session/{id}/label    — label a session as human/rat
 *   PUT /probe/session/{id}/label      — label a session (alternative method)
 *   POST /probe/sessions/bulk-label    — label multiple sessions at once
 *   GET  /probe/sessions               — list all sessions (JSON), optional ?username=X
 *   GET  /probe/sessions/label/{label} — list sessions by label (human/rat/all)
 *   GET  /probe/export/csv             — download all labelled sessions as CSV
 *   GET  /probe/export/csv/user        — download sessions for specific user as CSV
 *   GET  /probe/export/full-csv        — download ALL sessions (labelled + unlabelled)
 *   GET  /probe/stats                  — counts by label
 */
@RestController
@RequestMapping("/probe")
@CrossOrigin("*")   // allow Vercel frontend
public class ProbeController {

    private final ProbeSessionRepository repo;

    public ProbeController(ProbeSessionRepository repo) {
        this.repo = repo;
    }

    //  Save session 

    @PostMapping("/session")
    public ResponseEntity<Map<String, String>> saveSession(@RequestBody Map<String, Object> body) {
        ProbeSession s = new ProbeSession();

        s.setUsername(str(body, "username"));
        s.setCombinedScore(intVal(body, "combinedScore"));
        s.setAmbientScore(intVal(body, "ambientScore"));
        s.setCaptchaScore(intVal(body, "captchaScore"));
        s.setFlags(str(body, "flags"));
        s.setSessionJson(str(body, "sessionJson"));

        // Pre-computed features sent from frontend telemetry.js
        s.setStraightnessMean(dbl(body, "straightnessMean"));
        s.setStraightnessStd(dbl(body, "straightnessStd"));
        s.setDirEntropyMean(dbl(body, "dirEntropyMean"));
        s.setDirEntropyStd(dbl(body, "dirEntropyStd"));
        s.setVelCvMean(dbl(body, "velCvMean"));
        s.setVelCvStd(dbl(body, "velCvStd"));
        s.setVelStdMean(dbl(body, "velStdMean"));
        s.setAccelStdMean(dbl(body, "accelStdMean"));
        s.setPreDwellMean(dbl(body, "preDwellMean"));
        s.setPreDwellStd(dbl(body, "preDwellStd"));
        s.setReactionMsMean(dbl(body, "reactionMsMean"));
        s.setOvershootMean(dbl(body, "overshootMean"));
        s.setIdleBurstMean(dbl(body, "idleBurstMean"));
        s.setTrajPointsMean(dbl(body, "trajPointsMean"));
        s.setArcLengthMean(dbl(body, "arcLengthMean"));
        s.setDeviceOs(str(body, "deviceOs"));
        s.setDeviceBrowser(str(body, "deviceBrowser"));
        s.setScreenResolution(str(body, "screenResolution"));
        s.setDevicePixelRatio(dbl(body, "devicePixelRatio"));
        s.setNetworkLatencyMs(intVal(body, "networkLatencyMs"));

        repo.save(s);
        return ResponseEntity.ok(Map.of("id", s.getId(), "status", "saved"));
    }

    //  Label a session 
    @PatchMapping("/session/{id}/label")
    public ResponseEntity<Map<String, String>> label(
            @PathVariable String id,
            @RequestBody Map<String, String> body) {
        ProbeSession s = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Session not found: " + id));
        s.setLabel(body.get("label")); // "human", "rat", or null
        repo.save(s);
        return ResponseEntity.ok(Map.of("status", "labelled", "label", body.get("label")));
    }

    //  Label a session (PUT) 
    // NEW: Alternative PUT endpoint for labeling

    @PutMapping("/session/{id}/label")
    public ResponseEntity<Map<String, String>> labelSession(
            @PathVariable String id,
            @RequestBody Map<String, String> body) {
        ProbeSession s = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Session not found: " + id));
        s.setLabel(body.get("label")); // "human", "rat", or null
        repo.save(s);
        return ResponseEntity.ok(Map.of("status", "labelled", "label", body.get("label"), "id", id));
    }

    //  Bulk label sessions 
    // NEW: Bulk label endpoint for fast labeling

    @PostMapping("/sessions/bulk-label")
    public ResponseEntity<Map<String, Object>> bulkLabel(
            @RequestBody Map<String, Object> body) {
        
        @SuppressWarnings("unchecked")
        List<String> sessionIds = (List<String>) body.get("sessionIds");
        String label = (String) body.get("label");
        
        if (sessionIds == null || label == null) {
            throw new RuntimeException("Missing sessionIds or label");
        }
        
        int count = 0;
        for (String id : sessionIds) {
            var opt = repo.findById(id);
            if (opt.isPresent()) {
                ProbeSession s = opt.get();
                s.setLabel(label);
                repo.save(s);
                count++;
            }
        }
        
        return ResponseEntity.ok(Map.of(
            "status", "bulk labelled",
            "count", count,
            "label", label
        ));
    }

    //  List all sessions 
    // MODIFIED: Added optional username parameter to get sessions for specific user

    @GetMapping("/sessions")
    public List<ProbeSession> listAll(
            @RequestParam(required = false) String username) {
        
        if (username != null && !username.isEmpty()) {
            return repo.findByUsernameOrderByTimestampDesc(username);
        }
        return repo.findAllByOrderByTimestampDesc();
    }

    //  List sessions by label 
    // NEW: Filter sessions by label

    @GetMapping("/sessions/label/{label}")
    public List<ProbeSession> sessionsByLabel(
            @PathVariable String label) {
        if ("all".equals(label)) {
            return repo.findAllByOrderByTimestampDesc();
        }
        return repo.findByLabelOrderByTimestampDesc(label);
    }

    //  Stats 

    @GetMapping("/stats")
    public Map<String, Object> stats() {
        return Map.of(
            "total",      repo.count(),
            "human",      repo.countByLabel("human"),
            "rat",        repo.countByLabel("rat"),
            "unlabelled", repo.count() - repo.countByLabel("human") - repo.countByLabel("rat")
        );
    }

    //  CSV export (labelled only — for ML training) 

    @GetMapping("/export/csv")
    public ResponseEntity<byte[]> exportCsv() {
        List<ProbeSession> sessions = repo.findByLabelIsNotNull();
        return buildCsv(sessions, "ratprobe_labelled.csv");
    }

    //  CSV export (for specific user) 
    // NEW: Export only sessions for a specific user

    @GetMapping("/export/csv/user")
    public ResponseEntity<byte[]> exportCsvByUser(
            @RequestParam String username) {
        List<ProbeSession> sessions = repo.findByUsernameOrderByTimestampDesc(username);
        return buildCsv(sessions, "ratprobe_" + username + ".csv");
    }

    //  CSV export (all sessions) 

    @GetMapping("/export/full-csv")
    public ResponseEntity<byte[]> exportFullCsv() {
        List<ProbeSession> sessions = repo.findAllForExport();
        return buildCsv(sessions, "ratprobe_all_sessions.csv");
    }

    //  Build CSV bytes

    private ResponseEntity<byte[]> buildCsv(List<ProbeSession> sessions, String filename) {
        StringBuilder sb = new StringBuilder();

        // Header row
        sb.append("session_id,username,timestamp,combined_score,ambient_score,captcha_score,")
          .append("label,label_int,flags,")
          .append("device_os,device_browser,screen_resolution,device_pixel_ratio,network_latency_ms,")
          .append("straightness_mean,straightness_std,")
          .append("dir_entropy_mean,dir_entropy_std,")
          .append("vel_cv_mean,vel_cv_std,vel_std_mean,accel_std_mean,")
          .append("pre_dwell_mean,pre_dwell_std,reaction_ms_mean,")
          .append("overshoot_mean,idle_burst_mean,traj_points_mean,arc_length_mean\n");

        DateTimeFormatter fmt = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

        for (ProbeSession s : sessions) {
            sb.append(csv(s.getId())).append(",")
              .append(csv(s.getUsername())).append(",")
              .append(s.getTimestamp() != null ? s.getTimestamp().format(fmt) : "").append(",")
              .append(safe(s.getCombinedScore())).append(",")
              .append(safe(s.getAmbientScore())).append(",")
              .append(safe(s.getCaptchaScore())).append(",")
              .append(csv(s.getLabel())).append(",")
              .append("rat".equals(s.getLabel()) ? "1" : ("human".equals(s.getLabel()) ? "0" : "")).append(",")
              .append(csv(s.getFlags())).append(",") //label
              .append(csv(s.getDeviceOs())).append(",")              //device
              .append(csv(s.getDeviceBrowser())).append(",")        
              .append(csv(s.getScreenResolution())).append(",")     
              .append(safe(s.getDevicePixelRatio())).append(",")    
              .append(safe(s.getNetworkLatencyMs())).append(",")    //network

              .append(safe(s.getStraightnessMean())).append(",") // mouse data go
              .append(safe(s.getStraightnessStd())).append(",") //
              .append(safe(s.getDirEntropyMean())).append(",")
              .append(safe(s.getDirEntropyStd())).append(",")
              .append(safe(s.getVelCvMean())).append(",")
              .append(safe(s.getVelCvStd())).append(",")
              .append(safe(s.getVelStdMean())).append(",")
              .append(safe(s.getAccelStdMean())).append(",")
              .append(safe(s.getPreDwellMean())).append(",")
              .append(safe(s.getPreDwellStd())).append(",")
              .append(safe(s.getReactionMsMean())).append(",")
              .append(safe(s.getOvershootMean())).append(",")
              .append(safe(s.getIdleBurstMean())).append(",")
              .append(safe(s.getTrajPointsMean())).append(",")
              .append(safe(s.getArcLengthMean())).append("\n");
        }

        byte[] bytes = sb.toString().getBytes();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(bytes);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String csv(String v) {
        if (v == null) return "";
        return "\"" + v.replace("\"", "\"\"") + "\"";
    }

    private String safe(Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    private String str(Map<String, Object> m, String k) {
        Object v = m.get(k);
        return v == null ? null : String.valueOf(v);
    }

    private Integer intVal(Map<String, Object> m, String k) {
        Object v = m.get(k);
        if (v == null) return null;
        if (v instanceof Integer) return (Integer) v;
        try { return Integer.parseInt(String.valueOf(v)); } catch (Exception e) { return null; }
    }

    private Double dbl(Map<String, Object> m, String k) {
        Object v = m.get(k);
        if (v == null) return null;
        if (v instanceof Double) return (Double) v;
        if (v instanceof Number) return ((Number) v).doubleValue();
        try { return Double.parseDouble(String.valueOf(v)); } catch (Exception e) { return null; }
    }
}