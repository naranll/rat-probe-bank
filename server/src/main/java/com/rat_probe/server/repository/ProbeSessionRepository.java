package com.rat_probe.server.repository;

import com.rat_probe.server.model.ProbeSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ProbeSessionRepository extends JpaRepository<ProbeSession, String> {

    List<ProbeSession> findByUsernameOrderByTimestampDesc(String username);

    List<ProbeSession> findByLabelOrderByTimestampDesc(String label);

    List<ProbeSession> findAllByOrderByTimestampDesc();

    long countByLabel(String label);

    List<ProbeSession> findByLabelIsNotNull();

    @Query("SELECT p FROM ProbeSession p ORDER BY p.timestamp DESC")
    List<ProbeSession> findAllForExport();
}