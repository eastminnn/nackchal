package com.nackchal.domain.auction.model;

import java.util.ArrayList;
import java.util.List;
import java.util.random.RandomGenerator;

/**
 * 경매 물건 목록과 라운드별 추첨. 목록과 확률은 프론트의 game/catalog.ts와 같다.
 * 외형 힌트는 70% 확률로 실제 등급과 같고, 나머지는 다른 등급 중 하나를 암시한다.
 */
final class LotCatalog {

    private static final List<Item> ITEMS = List.of(
            new Item("radio", "할아버지의 라디오", "주파수는 안 잡혀도, 분위기 하나는 확실해요."),
            new Item("camera", "필름이 남은 카메라", "마지막 사진에는 어떤 장면이 담겼을까요?"),
            new Item("lamp", "초록빛 테이블 램프", "불이 들어오면 왠지 좋은 일이 생길 것 같아요."),
            new Item("shoe", "누군가의 한정판 운동화", "밑창은 닳았는데, 신발끈은 새것이에요."),
            new Item("teapot", "이야기가 담긴 주전자", "따뜻한 차 한 잔과 함께 온 오래된 물건."),
            new Item("duck", "제법 당당한 고무 오리", "욕조 출신인지, 수집가의 진열장 출신인지."),
            new Item("clock", "시간을 잊은 탁상시계", "하루에 두 번은 정확할지도 몰라요."),
            new Item("plant", "이름 모를 작은 화분", "평범한 잎사귀 사이에 숨은 가능성."),
            new Item("controller", "전설의 게임 컨트롤러", "시작 버튼에 누군가의 추억이 묻어 있어요."),
            new Item("vase", "다락방에서 찾은 화병", "바닥의 작은 서명, 혹시 유명한 작가일까요?"));

    private LotCatalog() {
    }

    /** 한 판에서 쓸 물건 순서. 매 게임 섞어서 같은 물건이 같은 라운드에 반복되지 않게 한다. */
    static List<Item> shuffled(RandomGenerator random) {
        List<Item> items = new ArrayList<>(ITEMS);
        for (int i = items.size() - 1; i > 0; i--) {
            int j = random.nextInt(i + 1);
            items.set(j, items.set(i, items.get(j)));
        }
        return items;
    }

    /** 공개용 물건 정보와 서버만 아는 등급·가치를 함께 뽑는다. */
    static Draw draw(Item item, RandomGenerator random) {
        Grade grade = grade(random.nextInt(100));
        int value = grade.minValue() + random.nextInt(grade.maxValue() - grade.minValue() + 1);
        Grade hint = grade;
        if (random.nextInt(100) >= 70) {
            List<Grade> others = new ArrayList<>(List.of(Grade.values()));
            others.remove(grade);
            hint = others.get(random.nextInt(others.size()));
        }
        return new Draw(new Lot(item.kind(), item.name(), item.description(), hint), new Secret(grade, value));
    }

    private static Grade grade(int roll) {
        int cumulative = 0;
        for (Grade grade : Grade.values()) {
            cumulative += grade.weight();
            if (roll < cumulative) return grade;
        }
        throw new IllegalStateException("Grade weights must add up to 100");
    }

    record Item(String kind, String name, String description) {
    }

    /** 참가자에게 보이는 물건 외형 정보. hint는 실제 등급이 아니다. */
    record Lot(String kind, String name, String description, Grade hint) {
    }

    /** 공개 전까지 서버 메모리에만 두는 실제 등급과 가치. */
    record Secret(Grade grade, int value) {
    }

    record Draw(Lot lot, Secret secret) {
    }
}
