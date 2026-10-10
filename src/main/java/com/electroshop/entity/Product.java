package com.electroshop.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;

@Entity
@Table(name = "products")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    private String category;
    private String emoji;

    @Builder.Default
    private Double costPrice = 0.0;

    @Column(nullable = false)
    private Double sellPrice;

    @Column(nullable = false)
    private Integer stock;

    @Builder.Default
    private Integer minStock = 5;

    private LocalDate lastSold;

    @Column(length = 1000000)
    private String imageBase64;
}