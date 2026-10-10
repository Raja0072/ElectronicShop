package com.electroshop.repository;

import com.electroshop.entity.SaleItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

public interface SaleItemRepository extends JpaRepository<SaleItem, Long> {

    List<SaleItem> findByProductId(Long productId);

    @Modifying
    @Transactional
    void deleteByProductId(Long productId);
}