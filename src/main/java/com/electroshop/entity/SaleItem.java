package com.electroshop.entity;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "sale_items")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SaleItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "sale_id")
    @JsonIgnoreProperties("items")
    private Sale sale;

    @ManyToOne
    @JoinColumn(name = "product_id")
    @JsonIgnoreProperties({"saleItems"})
    private Product product;

    private Integer quantity;
    private Double price;
    private Double cost;
}