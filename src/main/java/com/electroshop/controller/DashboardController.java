package com.electroshop.controller;

import com.electroshop.entity.Customer;
import com.electroshop.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.time.*;
import java.util.*;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final ProductRepository productRepo;
    private final CustomerRepository customerRepo;
    private final SaleRepository saleRepo;

    @GetMapping("/stats")
    public Map<String, Object> getStats() {
        LocalDateTime startOfDay = LocalDate.now().atStartOfDay();

        double totalDue = customerRepo.findByTotalDueGreaterThan(0.0)
                .stream().mapToDouble(Customer::getTotalDue).sum();

        Map<String, Object> stats = new HashMap<>();
        stats.put("todaySales",     saleRepo.getTodayTotal(startOfDay));
        stats.put("todayProfit",    saleRepo.getTodayProfit(startOfDay));
        stats.put("todayCount",     saleRepo.getTodayCount(startOfDay));
        stats.put("lowStockCount",  productRepo.findLowStockProducts().size());
        stats.put("dueCount",       customerRepo.findByTotalDueGreaterThan(0.0).size());
        stats.put("totalDueAmount", totalDue);
        return stats;
    }
}
