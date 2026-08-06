#!/usr/bin/env bash
# End-to-end smoke test of the Phase 1 API
set -e
BASE=http://localhost:4000/api

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"email":"erik@test.sk","password":"tajneheslo123"}' | python -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "1. LOGIN ok"

echo "2. Summary before onboarding (expect 428 ONBOARDING_REQUIRED):"
curl -s $BASE/me/summary -H "Authorization: Bearer $TOKEN"; echo

echo "3. Onboarding:"
curl -s -X POST $BASE/me/onboarding -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"languageCode":"es","cefrLevel":"A0","dailyMinutes":30,"mainGoal":"conversation","spanishVariant":"spain","nativeLanguage":"sk"}'; echo

echo "4. Summary:"
curl -s $BASE/me/summary -H "Authorization: Bearer $TOKEN" | python -m json.tool

echo "5. Today's lesson:"
curl -s $BASE/me/lesson/today -H "Authorization: Bearer $TOKEN" > /tmp/lesson.json
python -c "
import json
d = json.load(open('/tmp/lesson.json'))
l = d['lesson']
print('lesson:', l['id'], l['title'], 'day', l['dayNumber'])
print('vocab items:', len(l['parts']['vocabulary']))
print('exercises:', len(l['parts']['exercises']))
print('grammar:', l['parts']['grammar']['title'] if l['parts']['grammar'] else None)
print('review items:', len(l['parts']['review']))
json.dump({'lessonId': l['id'], 'exercises': [e['id'] for e in l['parts']['exercises']]}, open('/tmp/ids.json','w'))
"

echo "6. Grade all exercises (first answer correct by using answer from transcript):"
python - <<'EOF'
import json, urllib.request
base = "http://localhost:4000/api"
ids = json.load(open('/tmp/ids.json'))
token = open('/tmp/token.txt').read().strip() if False else None
EOF
