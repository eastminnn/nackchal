package com.nackchal.domain.auction.model;

/** 물건 등급. 출현 확률과 실제 가치 범위는 SRS 4장의 초기값이며 응답에는 한국어 이름으로 보낸다. */
public enum Grade {
    COMMON("일반", 55, 1, 30),
    RARE("레어", 30, 20, 80),
    EPIC("에픽", 12, 60, 150),
    LEGENDARY("전설", 3, 150, 400);

    private final String label;
    private final int weight;
    private final int minValue;
    private final int maxValue;

    Grade(String label, int weight, int minValue, int maxValue) {
        this.label = label;
        this.weight = weight;
        this.minValue = minValue;
        this.maxValue = maxValue;
    }

    public String label() {
        return label;
    }

    int weight() {
        return weight;
    }

    int minValue() {
        return minValue;
    }

    int maxValue() {
        return maxValue;
    }
}
