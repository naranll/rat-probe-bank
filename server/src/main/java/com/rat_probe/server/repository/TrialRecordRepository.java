package com.rat_probe.server.repository;

import com.rat_probe.server.model.TrialRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TrialRecordRepository extends JpaRepository<TrialRecord, String> {

    // ── Listing queries ────────────────────────────────────────────────────

    List<TrialRecord> findAllByOrderByTimestampDesc();

    List<TrialRecord> findByParticipantIdOrderByTimestampAsc(String participantId);

    List<TrialRecord> findByParticipantIdAndConditionOrderByTrialIdAsc(
        String participantId, String condition);

    List<TrialRecord> findBySessionIdOrderByTrialIdAsc(String sessionId);

    List<TrialRecord> findByTrialTypeOrderByTimestampDesc(String trialType);

    List<TrialRecord> findByConditionOrderByTimestampDesc(String condition);

    // ── Filtered export queries ────────────────────────────────────────────

    /**
     * For ML training — formal trials only, ordered for reproducibility.
     */
    @Query("SELECT t FROM TrialRecord t WHERE t.trialType = 'formal' " +
           "ORDER BY t.participantId ASC, t.condition ASC, t.trialId ASC")
    List<TrialRecord> findAllFormalForExport();

    @Query("SELECT t FROM TrialRecord t " +
           "WHERE t.trialType = 'formal' AND t.participantId = :pid " +
           "ORDER BY t.condition ASC, t.trialId ASC")
    List<TrialRecord> findFormalByParticipant(@Param("pid") String participantId);

    // ── Stats queries ──────────────────────────────────────────────────────

    long countByTrialType(String trialType);

    long countByParticipantId(String participantId);

    long countByParticipantIdAndCondition(String participantId, String condition);

    long countByConditionAndTrialType(String condition, String trialType);

    long countByLabel(String label);

    /**
     * Distinct participant IDs with at least one formal trial.
     */
    @Query("SELECT DISTINCT t.participantId FROM TrialRecord t " +
           "WHERE t.trialType = 'formal' ORDER BY t.participantId ASC")
    List<String> findDistinctParticipants();
}