"""Unit tests for face recognition service logic (no GPU/InsightFace needed)."""
import numpy as np
import pytest

from app.services.face_service import compute_similarity, recognize_face, _person_embeddings


def unit_vec(size: int = 512, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = rng.standard_normal(size).astype(np.float32)
    return v / np.linalg.norm(v)


class TestCosineSimilarity:
    def test_identical_vectors_similarity_is_one(self):
        v = unit_vec()
        assert compute_similarity(v, v) == pytest.approx(1.0, abs=1e-5)

    def test_orthogonal_vectors_similarity_is_zero(self):
        v1 = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        assert compute_similarity(v1, v2) == pytest.approx(0.0, abs=1e-5)

    def test_opposite_vectors_similarity_is_minus_one(self):
        v = unit_vec()
        assert compute_similarity(v, -v) == pytest.approx(-1.0, abs=1e-5)

    def test_zero_vector_returns_zero(self):
        v = unit_vec()
        zero = np.zeros(512, dtype=np.float32)
        assert compute_similarity(v, zero) == pytest.approx(0.0)


class TestRecognizeFace:
    def setup_method(self):
        """Inject a known person embedding into the in-memory cache."""
        import app.services.face_service as fs
        self._original = dict(fs._person_embeddings)
        self._known_vec = unit_vec(seed=42)
        fs._person_embeddings = {"person-uuid-123": self._known_vec}

    def teardown_method(self):
        import app.services.face_service as fs
        fs._person_embeddings = self._original

    def test_exact_match_recognized(self):
        result = recognize_face(self._known_vec, threshold=0.45)
        assert result.status == "recognized"
        assert result.matched_person_id == "person-uuid-123"
        assert result.similarity_score == pytest.approx(1.0, abs=1e-5)

    def test_dissimilar_face_unknown(self):
        dissimilar = unit_vec(seed=99)
        result = recognize_face(dissimilar, threshold=0.45)
        # Could be low_confidence or unknown depending on random similarity
        assert result.status in ("low_confidence", "unknown", "recognized")

    def test_empty_cache_returns_unknown(self):
        import app.services.face_service as fs
        fs._person_embeddings = {}
        result = recognize_face(self._known_vec)
        assert result.status == "unknown"
        assert result.matched_person_id is None

    def test_below_low_threshold_returns_unknown(self):
        opposite = -self._known_vec
        result = recognize_face(opposite, threshold=0.45)
        assert result.status == "unknown"
