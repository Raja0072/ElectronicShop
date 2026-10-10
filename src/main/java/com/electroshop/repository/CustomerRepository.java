package com.electroshop.repository;

import com.electroshop.entity.Customer;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CustomerRepository extends JpaRepository<Customer, Long> {

    List<Customer> findByNameContainingIgnoreCase(String name);

    List<Customer> findByPhone(String phone);

    List<Customer> findByTotalDueGreaterThan(Double amount);
}