package com.electroshop.repository;

import com.electroshop.entity.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDate;
import java.util.List;

public interface ProductRepository extends JpaRepository<Product, Long> {

    List<Product> findByNameContainingIgnoreCase(String name);

    List<Product> findByCategory(String category);

    @Query("SELECT p FROM Product p WHERE p.stock <= p.minStock")
    List<Product> findLowStockProducts();

    @Query("SELECT p FROM Product p WHERE p.lastSold < :date OR p.lastSold IS NULL")
    List<Product> findSlowSelling(@Param("date") LocalDate date);
}