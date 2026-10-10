package com.electroshop.controller;

import com.electroshop.entity.Customer;
import com.electroshop.entity.Sale;
import com.electroshop.repository.CustomerRepository;
import com.electroshop.repository.PaymentRepository;
import com.electroshop.repository.SaleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/customers")
@RequiredArgsConstructor
public class CustomerController {

    private final CustomerRepository customerRepo;
    private final SaleRepository saleRepo;
    private final PaymentRepository paymentRepo;

    @GetMapping
    public List<Customer> getAll() {
        return customerRepo.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Customer> getById(@PathVariable Long id) {
        return customerRepo.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/due")
    public List<Customer> getDueCustomers() {
        return customerRepo.findByTotalDueGreaterThan(0.0);
    }

    @PostMapping
    public Customer create(@RequestBody Customer customer) {
        if (customer.getTotalDue() == null) customer.setTotalDue(0.0);
        if (customer.getTotalPurchases() == null) customer.setTotalPurchases(0);
        return customerRepo.save(customer);
    }
@PutMapping("/{id}")
public ResponseEntity<Customer> update(@PathVariable Long id,
                                       @RequestBody Customer updated) {
    return customerRepo.findById(id).map(c -> {
        c.setName(updated.getName());
        c.setPhone(updated.getPhone());
        if (updated.getTotalDue() != null) {
            c.setTotalDue(updated.getTotalDue());
        }
        return ResponseEntity.ok(customerRepo.save(c));
    }).orElse(ResponseEntity.notFound().build());
}
 

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!customerRepo.existsById(id)) return ResponseEntity.notFound().build();

        List<Sale> sales = saleRepo.findByCustomerId(id);
        for (Sale sale : sales) {
            sale.setCustomer(null);
            saleRepo.save(sale);
        }

        paymentRepo.deleteByCustomerId(id);
        customerRepo.deleteById(id);
        return ResponseEntity.ok().build();
    }
@GetMapping("/{id}/history")
public List<Map<String, Object>> getHistory(@PathVariable Long id) {
    List<Sale> sales = saleRepo.findByCustomerId(id);
    List<Map<String, Object>> history = new ArrayList<>();
    for (Sale sale : sales) {
        Map<String, Object> item = new HashMap<>();
        item.put("date", sale.getSaleDate().toLocalDate().toString());
        item.put("total", sale.getTotalAmount());
        item.put("paid", sale.getAmountPaid());
        item.put("due", sale.getDueAmount());
        String itemNames = sale.getItems() != null
            ? sale.getItems().stream()
                .map(i -> i.getProduct().getName() + " x" + i.getQuantity())
                .collect(Collectors.joining(", "))
            : "No items";
        item.put("items", itemNames);
        history.add(item);
    }
    return history;
}
    
}