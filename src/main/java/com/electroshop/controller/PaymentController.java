package com.electroshop.controller;

import com.electroshop.entity.Customer;
import com.electroshop.entity.Payment;
import com.electroshop.repository.CustomerRepository;
import com.electroshop.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentRepository paymentRepo;
    private final CustomerRepository customerRepo;

    @GetMapping("/customer/{customerId}")
    public List<Payment> getByCustomer(@PathVariable Long customerId) {
        return paymentRepo.findByCustomerIdOrderByPaymentDateDesc(customerId);
    }

    @PostMapping
    @Transactional
    public Payment createPayment(@RequestBody Map<String, Object> body) {
        if (!(body.get("customerId") instanceof Number) || !(body.get("amount") instanceof Number)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "customerId and amount are required");
        }
        Long customerId = ((Number) body.get("customerId")).longValue();
        double amount = ((Number) body.get("amount")).doubleValue();
        if (amount <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Amount must be greater than 0");
        }
        String note = body.get("note") != null ? body.get("note").toString() : "Due payment collected";

        Customer customer = customerRepo.findById(customerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer not found"));

        // Update customer due amount
        double currentDue = customer.getTotalDue() != null ? customer.getTotalDue() : 0.0;
        customer.setTotalDue(Math.max(0, currentDue - amount));
        customerRepo.save(customer);

        // Save payment record
        Payment payment = Payment.builder()
                .customer(customer)
                .amount(amount)
                .paymentDate(LocalDateTime.now())
                .note(note)
                .build();

        return paymentRepo.save(payment);
    }
}
