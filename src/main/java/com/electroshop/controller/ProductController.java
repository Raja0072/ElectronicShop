package com.electroshop.controller;

import com.electroshop.entity.PriceHistory;
import com.electroshop.entity.Product;
import com.electroshop.entity.SaleItem;
import com.electroshop.repository.PriceHistoryRepository;
import com.electroshop.repository.ProductRepository;
import com.electroshop.repository.SaleItemRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import jakarta.transaction.Transactional;
import com.electroshop.entity.SaleItem;
import java.util.List;


@RestController
@RequestMapping("/api/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductRepository productRepo;
    private final PriceHistoryRepository historyRepo;
    private final SaleItemRepository saleItemRepo;

    @GetMapping
    public List<Product> getAll() {
        return productRepo.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Product> getById(@PathVariable Long id) {
        return productRepo.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/search")
    public List<Product> search(@RequestParam String q) {
        return productRepo.findByNameContainingIgnoreCase(q);
    }

    @GetMapping("/low-stock")
    public List<Product> getLowStock() {
        return productRepo.findLowStockProducts();
    }

    @GetMapping("/slow-selling")
    public List<Product> getSlowSelling() {
        LocalDate cutoff = LocalDate.now().minusDays(30);
        return productRepo.findSlowSelling(cutoff);
    }

    @PostMapping
    public Product create(@RequestBody Product product) {
        if (product.getCostPrice() == null) product.setCostPrice(0.0);
        return productRepo.save(product);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Product> update(@PathVariable Long id,
                                          @RequestBody Product updated) {
        if (updated.getName() == null || updated.getSellPrice() == null || updated.getStock() == null) {
            return ResponseEntity.badRequest().<Product>build();
        }
        return productRepo.findById(id).map(existing -> {
            double newCost = updated.getCostPrice() != null ? updated.getCostPrice() : 0.0;
            boolean priceChanged =
                !Objects.equals(existing.getSellPrice(), updated.getSellPrice()) ||
                !Objects.equals(existing.getCostPrice(), newCost);

            if (priceChanged) {
                historyRepo.save(PriceHistory.builder()
                        .product(existing)
                        .oldCostPrice(existing.getCostPrice())
                        .oldSellPrice(existing.getSellPrice())
                        .changedDate(LocalDate.now())
                        .build());
            }

            existing.setName(updated.getName());
            existing.setCategory(updated.getCategory());
            existing.setEmoji(updated.getEmoji());
            existing.setCostPrice(
                updated.getCostPrice() != null ? updated.getCostPrice() : 0.0);
            existing.setSellPrice(updated.getSellPrice());
            existing.setStock(updated.getStock());
            existing.setMinStock(
                updated.getMinStock() != null ? updated.getMinStock() : 5);
            if (updated.getImageBase64() != null) {
                existing.setImageBase64(updated.getImageBase64());
            }
            return ResponseEntity.ok(productRepo.save(existing));
        }).orElse(ResponseEntity.notFound().build());
    }
  @Transactional
@DeleteMapping("/{id}")
public ResponseEntity<Void> delete(@PathVariable Long id) {
    if (!productRepo.existsById(id)) return ResponseEntity.notFound().build();

    // Step 1 - Delete price history
    historyRepo.deleteAll(
        historyRepo.findByProductIdOrderByChangedDateDesc(id));

    // Step 2 - Set product to null in sale items then delete them
    List<SaleItem> saleItems = saleItemRepo.findByProductId(id);
    for (SaleItem item : saleItems) {
        item.setProduct(null);
        saleItemRepo.save(item);
    }
    saleItemRepo.deleteAll(saleItems);

    // Step 3 - Delete product
    productRepo.deleteById(id);
    return ResponseEntity.ok().build();
}

    

    @GetMapping("/{id}/price-history")
    public List<PriceHistory> getPriceHistory(@PathVariable Long id) {
        return historyRepo.findByProductIdOrderByChangedDateDesc(id);
    }

    @PostMapping("/import")
    public List<Product> importProducts(@RequestBody List<Product> products) {
        products.forEach(p -> {
            if (p.getCostPrice() == null) p.setCostPrice(0.0);
        });
        return productRepo.saveAll(products);
    }
}
