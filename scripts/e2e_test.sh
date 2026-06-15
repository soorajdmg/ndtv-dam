#!/usr/bin/env bash
# End-to-end smoke test for the NDTV DAM pipeline
# Usage: bash scripts/e2e_test.sh

set -euo pipefail

API="${NEXT_PUBLIC_API_URL:-http://localhost:8000}"
TEST_IMAGE_DIR="$(dirname "$0")/test_images"
POLL_INTERVAL=5
MAX_POLLS=60

echo "=== NDTV DAM E2E Smoke Test ==="
echo "API: $API"
echo ""

# 1. Health Check
echo "[1/5] Checking health..."
HEALTH=$(curl -sf "$API/health")
echo "  $HEALTH"
echo "  ✓ Health OK"

# 2. Create test images if not present
mkdir -p "$TEST_IMAGE_DIR"
for i in $(seq 1 5); do
    if [ ! -f "$TEST_IMAGE_DIR/test_$i.jpg" ]; then
        # Create minimal 1x1 JPEG using Python
        python3 -c "
from PIL import Image
img = Image.new('RGB', (640, 480), color=(100 + $i * 20, 80, 60))
img.save('$TEST_IMAGE_DIR/test_$i.jpg')
"
    fi
done
echo "[2/5] Test images ready (5 images)"

# 3. Upload batch
echo "[3/5] Uploading batch..."
UPLOAD_RESPONSE=$(curl -sf -X POST "$API/api/upload/batch" \
    -F "files=@$TEST_IMAGE_DIR/test_1.jpg" \
    -F "files=@$TEST_IMAGE_DIR/test_2.jpg" \
    -F "files=@$TEST_IMAGE_DIR/test_3.jpg" \
    -F "submitted_by=e2e_test")

BATCH_ID=$(echo "$UPLOAD_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['batch_id'])")
echo "  Batch ID: $BATCH_ID"
echo "  ✓ Upload accepted"

# 4. Poll for completion
echo "[4/5] Polling batch status..."
for i in $(seq 1 $MAX_POLLS); do
    STATUS=$(curl -sf "$API/api/batch/$BATCH_ID/status")
    BATCH_STATUS=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
    PERCENT=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['percent_complete'])")
    echo "  Poll $i: status=$BATCH_STATUS, progress=$PERCENT%"

    if [[ "$BATCH_STATUS" == "completed" || "$BATCH_STATUS" == "partial_failure" ]]; then
        echo "  ✓ Batch finished: $BATCH_STATUS"
        break
    fi
    if [[ "$BATCH_STATUS" == "failed" ]]; then
        echo "  ✗ Batch failed!"
        exit 1
    fi
    sleep $POLL_INTERVAL
done

# 5. Check shortlist
echo "[5/5] Checking shortlist..."
SHORTLIST=$(curl -sf "$API/api/batch/$BATCH_ID/shortlist")
COUNT=$(echo "$SHORTLIST" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
echo "  Shortlisted: $COUNT images"

if [ "$COUNT" -ge 1 ]; then
    echo "  ✓ Shortlist generated"
else
    echo "  ⚠ No shortlisted images (processing may still be in progress)"
fi

echo ""
echo "=== E2E Test Complete ==="
echo "Batch: $BATCH_ID"
echo "View at: http://localhost:3000/batches/$BATCH_ID"
