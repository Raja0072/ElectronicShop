package com.electroshop.repository;

import com.electroshop.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    List<Payment> findByCustomerIdOrderByPaymentDateDesc(Long customerId);

    @Modifying
    @Transactional
    void deleteByCustomerId(Long customerId);
}