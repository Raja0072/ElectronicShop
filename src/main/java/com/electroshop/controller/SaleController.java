package com.electroshop.controller;

import com.electroshop.entity.Customer;
import com.electroshop.entity.Payment;
import com.electroshop.entity.Product;
import com.electroshop.entity.Sale;
import com.electroshop.entity.SaleItem;
import com.electroshop.repository.CustomerRepository;
import com.electroshop.repository.PaymentRepository;
import com.electroshop.repository.ProductRepository;
import com.electroshop.repository.SaleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sales")
@RequiredArgsConstructor
public class SaleController {

    private final SaleRepository saleRepo;
    private final CustomerRepository customerRepo;
    private final ProductRepository productRepo;
    private final PaymentRepository paymentRepo;

    @GetMapping
    public List<Sale> getSales(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        if (from != null && to != null) {
            LocalDateTime start = LocalDate.parse(from).atStartOfDay();
            LocalDateTime end = LocalDate.parse(to).atTime(23, 59, 59);
            return saleRepo.findBySaleDateBetween(start, end);
        }
        return saleRepo.findAll();
    }

    @GetMapping("/daily")
    public Map<String, Object> getDailySummary(@RequestParam(required = false) String date) {
        LocalDate day = date != null ? LocalDate.parse(date) : LocalDate.now();
        List<Sale> sales = saleRepo.findBySaleDateBetween(day.atStartOfDay(), day.atTime(23, 59, 59));
        double total  = sales.stream().mapToDouble(s -> s.getTotalAmount() != null ? s.getTotalAmount() : 0).sum();
        double profit = sales.stream().mapToDouble(s -> s.getProfit()      != null ? s.getProfit()      : 0).sum();
        Map<String, Object> result = new HashMap<>();
        result.put("total",  total);
        result.put("profit", profit);
        result.put("count",  sales.size());
        return result;
    }

    @GetMapping("/monthly")
    public Map<String, Object> getMonthlySummary(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        LocalDateTime start = from != null
                ? LocalDate.parse(from).atStartOfDay()
                : LocalDate.now().withDayOfMonth(1).atStartOfDay();
        LocalDateTime end = to != null
                ? LocalDate.parse(to).atTime(23, 59, 59)
                : LocalDate.now().atTime(23, 59, 59);
        List<Sale> sales = saleRepo.findBySaleDateBetween(start, end);
        double total  = sales.stream().mapToDouble(s -> s.getTotalAmount() != null ? s.getTotalAmount() : 0).sum();
        double profit = sales.stream().mapToDouble(s -> s.getProfit()      != null ? s.getProfit()      : 0).sum();
        Map<String, Object> result = new HashMap<>();
        result.put("total",  total);
        result.put("profit", profit);
        result.put("count",  sales.size());
        return result;
    }

    @PostMapping
    @Transactional
    @SuppressWarnings("unchecked")
    public Sale createSale(@RequestBody Map<String, Object> body) {

        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
        if (items == null || items.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sale has no items");
        }

        double total = toDouble(body.get("totalAmount"));
        double paid  = toDouble(body.get("amountPaid"));
        if (total < 0 || paid < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Amounts cannot be negative");
        }
        double due = Math.max(0, total - paid);

        Sale sale = new Sale();
        sale.setSaleDate(LocalDateTime.now());
        sale.setTotalAmount(total);
        sale.setAmountPaid(paid);
        sale.setDueAmount(due);

        // Build sale items, update stock, and compute profit from the items
        List<SaleItem> saleItems = new ArrayList<>();
        double profit = 0;
        for (Map<String, Object> itemData : items) {
            Long productId = toLong(itemData.get("productId"));
            int qty = toInt(itemData.get("quantity"));
            if (qty <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity must be greater than 0");
            }
            Product product = productRepo.findById(productId)
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "Product not found: " + productId));

            double price = toDouble(itemData.get("price"));
            double cost  = toDouble(itemData.get("cost"));

            saleItems.add(SaleItem.builder()
                    .sale(sale)
                    .product(product)
                    .quantity(qty)
                    .price(price)
                    .cost(cost)
                    .build());
            profit += (price - cost) * qty;

            int currentStock = product.getStock() != null ? product.getStock() : 0;
            product.setStock(Math.max(0, currentStock - qty));
            product.setLastSold(LocalDate.now());
            productRepo.save(product);
        }
        sale.setProfit(profit);
        sale.setItems(saleItems);

        // Attach customer (if any) and ADD to their existing due
        Customer customer = null;
        if (body.get("customerId") != null) {
            customer = customerRepo.findById(toLong(body.get("customerId"))).orElse(null);
        }
        if (customer != null) {
            sale.setCustomer(customer);
            double existingDue = customer.getTotalDue() != null ? customer.getTotalDue() : 0.0;
            int purchases = customer.getTotalPurchases() != null ? customer.getTotalPurchases() : 0;
            customer.setTotalDue(existingDue + due);
            customer.setTotalPurchases(purchases + 1);
            customerRepo.save(customer);
        }

        Sale saved = saleRepo.save(sale);

        // Record what the customer paid at the counter
        if (paid > 0) {
            String note = customer != null
                    ? "Paid ₹" + paid + " for sale #" + saved.getId()
                        + (due > 0 ? " — Due ₹" + due : " — Fully paid")
                    : "Walk-in sale #" + saved.getId();
            paymentRepo.save(Payment.builder()
                    .customer(customer)
                    .amount(paid)
                    .paymentDate(LocalDateTime.now())
                    .note(note)
                    .build());
        }

        return saved;
    }

    private Double toDouble(Object val) {
        if (val == null) return 0.0;
        return ((Number) val).doubleValue();
    }

    private Long toLong(Object val) {
        if (val == null) return 0L;
        return ((Number) val).longValue();
    }

    private int toInt(Object val) {
        if (val == null) return 0;
        return ((Number) val).intValue();
    }
}
