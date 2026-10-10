package com.electroshop.repository;

import com.electroshop.entity.Sale;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;

public interface SaleRepository extends JpaRepository<Sale, Long> {

    List<Sale> findBySaleDateBetween(LocalDateTime start, LocalDateTime end);

    List<Sale> findByCustomerId(Long customerId);

    @Query("SELECT COALESCE(SUM(s.totalAmount), 0) FROM Sale s WHERE s.saleDate >= :start")
    Double getTodayTotal(@Param("start") LocalDateTime start);

    @Query("SELECT COALESCE(SUM(s.profit), 0) FROM Sale s WHERE s.saleDate >= :start")
    Double getTodayProfit(@Param("start") LocalDateTime start);

    @Query("SELECT COUNT(s) FROM Sale s WHERE s.saleDate >= :start")
    Long getTodayCount(@Param("start") LocalDateTime start);
}