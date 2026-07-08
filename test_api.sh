#!/bin/bash
# Kanban API Regression Test Script
# Usage: bash test_api.sh
BASE="http://localhost:3001/api"
PASS=0
FAIL=0
PROJECT_ID=3

echo "============================================"
echo " Kanban API Regression Tests"
echo "============================================"

# Helper function
assert_ok() {
  local test_name="$1"
  local resp="$2"
  local expect_status="$3"
  
  local ok=$(echo "$resp" | python -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('ok') else 'false')" 2>/dev/null)
  
  if [ "$ok" = "true" ] && [ -z "$expect_status" ]; then
    echo "  ✅ $test_name"
    PASS=$((PASS+1))
  elif [ "$ok" = "$expect_status" ]; then
    echo "  ✅ $test_name"
    PASS=$((PASS+1))
  else
    echo "  ❌ $test_name — expected ok=$expect_status, got ok=$ok"
    echo "     Response: $resp" | head -c 200
    echo ""
    FAIL=$((FAIL+1))
  fi
}

assert_status() {
  local test_name="$1"
  local http_code="$2"
  local expected="$3"
  
  if [ "$http_code" = "$expected" ]; then
    echo "  ✅ $test_name (HTTP $http_code)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $test_name — expected HTTP $expected, got $http_code"
    FAIL=$((FAIL+1))
  fi
}

# ── CLEANUP: delete existing test tasks ──
echo ""
echo "--- CLEANUP ---"
for tid in $(curl -s "$BASE/tasks?project_id=$PROJECT_ID" | python -c "import sys,json; d=json.load(sys.stdin); print(' '.join([str(t['id']) for t in d['data']]))" 2>/dev/null); do
  curl -s -X DELETE "$BASE/tasks/$tid" > /dev/null
done
echo "  Cleaned up project $PROJECT_ID tasks"

# ── TEST 1: kanban-stats (empty) ──
echo ""
echo "--- 1. GET /projects/:id/kanban-stats ---"
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/projects/$PROJECT_ID/kanban-stats")
assert_status "kanban-stats returns 200" "$RESP" "200"

RESP=$(curl -s "$BASE/projects/$PROJECT_ID/kanban-stats")
assert_ok "kanban-stats ok=true" "$RESP"
TOTAL=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['total'])" 2>/dev/null)
echo "  Stats: total=$TOTAL"

# ── TEST 2: Create task ──
echo ""
echo "--- 2. POST /tasks (create) ---"
RESP=$(curl -s -X POST "$BASE/tasks" -H "Content-Type: application/json" \
  -d "{\"project_id\":$PROJECT_ID,\"title\":\"QA测试-拖拽排序A\",\"priority\":\"high\"}")
assert_ok "Create task A" "$RESP"
TASK_A_ID=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])" 2>/dev/null)
echo "  Task A ID: $TASK_A_ID"

RESP=$(curl -s -X POST "$BASE/tasks" -H "Content-Type: application/json" \
  -d "{\"project_id\":$PROJECT_ID,\"title\":\"QA测试-拖拽排序B\",\"priority\":\"medium\"}")
assert_ok "Create task B" "$RESP"
TASK_B_ID=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])" 2>/dev/null)
echo "  Task B ID: $TASK_B_ID"

RESP=$(curl -s -X POST "$BASE/tasks" -H "Content-Type: application/json" \
  -d "{\"project_id\":$PROJECT_ID,\"title\":\"QA测试-拖拽排序C\",\"priority\":\"low\"}")
assert_ok "Create task C" "$RESP"
TASK_C_ID=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])" 2>/dev/null)
echo "  Task C ID: $TASK_C_ID"

# ── TEST 3: Create subtasks ──
echo ""
echo "--- 3. POST /tasks/:id/subtasks ---"
RESP=$(curl -s -X POST "$BASE/tasks/$TASK_A_ID/subtasks" -H "Content-Type: application/json" \
  -d '{"title":"子任务1-验证API"}' )
assert_ok "Create subtask 1" "$RESP"
SUB1_ID=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])" 2>/dev/null)
echo "  Subtask 1 ID: $SUB1_ID"

RESP=$(curl -s -X POST "$BASE/tasks/$TASK_A_ID/subtasks" -H "Content-Type: application/json" \
  -d '{"title":"子任务2-验证API"}' )
assert_ok "Create subtask 2" "$RESP"
SUB2_ID=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])" 2>/dev/null)
echo "  Subtask 2 ID: $SUB2_ID"

# ── TEST 4: GET subtasks ──
echo ""
echo "--- 4. GET /tasks/:id/subtasks ---"
RESP=$(curl -s "$BASE/tasks/$TASK_A_ID/subtasks")
assert_ok "List subtasks" "$RESP"
SUBTASK_COUNT=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']))" 2>/dev/null)
echo "  Subtask count: $SUBTASK_COUNT"
if [ "$SUBTASK_COUNT" != "2" ]; then
  echo "  ❌ Expected 2 subtasks, got $SUBTASK_COUNT"
  FAIL=$((FAIL+1))
fi

# ── TEST 5: PUT /subtasks/:id (complete) ──
echo ""
echo "--- 5. PUT /subtasks/:id (toggle complete) ---"
RESP=$(curl -s -X PUT "$BASE/subtasks/$SUB1_ID" -H "Content-Type: application/json" \
  -d '{"is_completed":true}')
assert_ok "Mark subtask 1 as completed" "$RESP"
IS_COMP=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['is_completed'])" 2>/dev/null)
if [ "$IS_COMP" != "1" ]; then
  echo "  ❌ Expected is_completed=1, got $IS_COMP"
  FAIL=$((FAIL+1))
fi

# ── TEST 6: PUT /subtasks/:id (uncomplete) ──
echo ""
echo "--- 6. PUT /subtasks/:id (toggle uncomplete) ---"
RESP=$(curl -s -X PUT "$BASE/subtasks/$SUB1_ID" -H "Content-Type: application/json" \
  -d '{"is_completed":false}')
assert_ok "Mark subtask 1 as uncompleted" "$RESP"
IS_COMP=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['is_completed'])" 2>/dev/null)
if [ "$IS_COMP" != "0" ]; then
  echo "  ❌ Expected is_completed=0, got $IS_COMP"
  FAIL=$((FAIL+1))
fi

# ── TEST 7: DELETE /subtasks/:id (soft) ──
echo ""
echo "--- 7. DELETE /subtasks/:id (soft delete) ---"
RESP=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/subtasks/$SUB2_ID")
assert_status "Soft delete subtask 2" "$RESP" "200"

# Verify still accessible tasks but subtask gone from list
RESP=$(curl -s "$BASE/tasks/$TASK_A_ID/subtasks")
SUBTASK_COUNT=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']))" 2>/dev/null)
if [ "$SUBTASK_COUNT" != "1" ]; then
  echo "  ❌ After soft delete, expected 1 subtask, got $SUBTASK_COUNT"
  FAIL=$((FAIL+1))
fi

# ── TEST 8: PUT /tasks/:id/toggle-complete ──
echo ""
echo "--- 8. PUT /tasks/:id/toggle-complete ---"
RESP=$(curl -s -X PUT "$BASE/tasks/$TASK_B_ID/toggle-complete")
assert_ok "Toggle task B to completed" "$RESP"
COMP_AT=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['completed_at'])" 2>/dev/null)
COL=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['kanban_column'])" 2>/dev/null)
echo "  completed_at=$COMP_AT, column=$COL"
if [ -z "$COMP_AT" ] || [ "$COMP_AT" = "None" ]; then
  echo "  ❌ expected completed_at to be set"
  FAIL=$((FAIL+1))
fi

# Toggle back
RESP=$(curl -s -X PUT "$BASE/tasks/$TASK_B_ID/toggle-complete")
assert_ok "Toggle task B back to todo" "$RESP"
COMP_AT=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['completed_at'])" 2>/dev/null)
COL=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['kanban_column'])" 2>/dev/null)
echo "  completed_at=$COMP_AT, column=$COL"
if [ "$COMP_AT" != "None" ] && [ -n "$COMP_AT" ]; then
  echo "  ❌ expected completed_at to be None after undo"
  FAIL=$((FAIL+1))
fi

# ── TEST 9: PUT /tasks/:id/reorder ──
echo ""
echo "--- 9. PUT /tasks/:id/reorder ---"
# Move task C (index 2) to index 1
RESP=$(curl -s -X PUT "$BASE/tasks/$TASK_C_ID/reorder" -H "Content-Type: application/json" \
  -d "{\"sort_order\":1,\"project_id\":$PROJECT_ID}")
assert_ok "Reorder task C to position 1" "$RESP"
NEW_ORDER=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['sort_order'])" 2>/dev/null)
echo "  New sort_order=$NEW_ORDER"

# Verify full ordering
RESP=$(curl -s "$BASE/tasks?project_id=$PROJECT_ID")
ORDERS=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print([t['sort_order'] for t in d['data']])" 2>/dev/null)
echo "  All sort_orders: $ORDERS"

# ── TEST 10: kanban-stats (with data) ──
echo ""
echo "--- 10. GET /projects/:id/kanban-stats (with data) ---"
RESP=$(curl -s "$BASE/projects/$PROJECT_ID/kanban-stats")
assert_ok "kanban-stats with data" "$RESP"
echo "  Data: $(echo "$RESP" | python -c "import sys,json; print(json.dumps(json.load(sys.stdin)['data']))" 2>/dev/null)"

# ── TEST 11: Verify sort_order on task create ──
echo ""
echo "--- 11. sort_order auto-assignment ---"
RESP=$(curl -s -X POST "$BASE/tasks" -H "Content-Type: application/json" \
  -d "{\"project_id\":$PROJECT_ID,\"title\":\"QA测试-自动排序\",\"priority\":\"medium\"}")
assert_ok "Create task with auto sort_order" "$RESP"
SORT=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['sort_order'])" 2>/dev/null)
echo "  Auto sort_order=$SORT"

# ── SUMMARY ──
echo ""
echo "============================================"
echo " RESULTS: $PASS passed, $FAIL failed ($((PASS + FAIL)) total)"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
else
  exit 0
fi
