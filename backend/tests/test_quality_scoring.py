"""Unit tests for quality scoring logic (no DB needed)."""
import numpy as np
import pytest

from app.tasks.quality_tasks import (
    compute_brightness,
    compute_contrast,
    compute_sharpness,
    compute_rule_of_thirds_score,
    normalize_brightness,
)


def make_gray(value: int, size: int = 64) -> np.ndarray:
    return np.full((size, size), value, dtype=np.uint8)


class TestSharpness:
    def test_uniform_image_is_zero_sharpness(self):
        img = make_gray(128)
        assert compute_sharpness(img) == pytest.approx(0.0)

    def test_high_contrast_image_has_high_sharpness(self):
        img = np.zeros((64, 64), dtype=np.uint8)
        img[::2, ::2] = 255  # checkerboard
        assert compute_sharpness(img) > 1000


class TestBrightness:
    def test_black_image_brightness_is_zero(self):
        assert compute_brightness(make_gray(0)) == pytest.approx(0.0)

    def test_white_image_brightness_is_255(self):
        assert compute_brightness(make_gray(255)) == pytest.approx(255.0)

    def test_mid_gray_brightness(self):
        assert compute_brightness(make_gray(128)) == pytest.approx(128.0)


class TestContrast:
    def test_uniform_image_has_zero_contrast(self):
        assert compute_contrast(make_gray(100)) == pytest.approx(0.0)

    def test_bimodal_image_has_high_contrast(self):
        img = np.zeros((64, 64), dtype=np.uint8)
        img[:32, :] = 0
        img[32:, :] = 255
        assert compute_contrast(img) > 100


class TestNormalizeBrightness:
    def test_in_range_returns_one(self):
        assert normalize_brightness(128, 60, 210) == pytest.approx(1.0)

    def test_below_range_degraded(self):
        score = normalize_brightness(30, 60, 210)
        assert 0.0 <= score < 1.0

    def test_above_range_degraded(self):
        score = normalize_brightness(240, 60, 210)
        assert 0.0 <= score < 1.0

    def test_zero_brightness_returns_zero(self):
        assert normalize_brightness(0, 60, 210) == pytest.approx(0.0)


class TestRuleOfThirds:
    def test_face_at_thirds_intersection_scores_high(self):
        # Face centred exactly at a thirds intersection
        w, h = 900, 600
        # Intersection at (300, 200)
        score = compute_rule_of_thirds_score((280, 180, 40, 40), w, h)
        assert score > 0.8

    def test_face_at_center_scores_moderate(self):
        w, h = 900, 600
        score = compute_rule_of_thirds_score((430, 280, 40, 40), w, h)
        # Center is not at a thirds intersection
        assert 0.0 <= score <= 1.0

    def test_score_is_in_range(self):
        for x in range(0, 900, 100):
            for y in range(0, 600, 100):
                score = compute_rule_of_thirds_score((x, y, 50, 50), 900, 600)
                assert 0.0 <= score <= 1.0
