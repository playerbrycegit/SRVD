#!/bin/bash
set -e
BASE="http://localhost:4001"

extract() {
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log($1)}catch(e){console.log('PARSE_ERROR')}})"
}

echo "### SCENARIO: Weekly goal ###"
GOAL=$(curl -s -X POST $BASE/goals -H "Authorization: Bearer $1" -H "Content-Type: application/json" -d '{"target_amount":500}')
echo "  create goal response: $GOAL"
PROGRESS=$(curl -s $BASE/goals -H "Authorization: Bearer $1")
echo "  progress after the earlier shift: $PROGRESS"

echo "### SCENARIO: Recipe Vault ###"
RECIPE=$(curl -s -X POST $BASE/recipes -H "Authorization: Bearer $1" -H "Content-Type: application/json" -d '{"name":"Scenario Test Recipe","category":"Shaken","ingredients":[{"ingredient_name":"Gin","amount":"2","unit":"oz"}]}')
echo "  create recipe response: $RECIPE"
SEARCH=$(curl -s "$BASE/recipes?search=Scenario" -H "Authorization: Bearer $1")
echo "  search response: $SEARCH"
echo "  NOTE: no PATCH/edit route exists for recipes or shifts - confirmed already-known gap, cannot test 'edit' steps"

echo "### SCENARIO: Tools ###"
BATCH=$(curl -s -X POST $BASE/tools/batch -H "Authorization: Bearer $1" -H "Content-Type: application/json" -d '{"baseServings":1,"targetServings":8,"ingredients":[{"name":"Rum","amount":1.5}]}')
echo "  batch scale (1.5oz x 8/1): $BATCH"
ABV=$(curl -s -X POST $BASE/tools/abv -H "Authorization: Bearer $1" -H "Content-Type: application/json" -d '{"ingredients":[{"volumeOz":2,"abvPercent":40}],"dilution":0.5}')
echo "  abv calc (2oz@40%, +0.5oz dilution): $ABV"
CONVERT=$(curl -s -X POST $BASE/tools/convert -H "Authorization: Bearer $1" -H "Content-Type: application/json" -d '{"amount":1.5,"fromUnit":"oz","toUnit":"ml"}')
echo "  unit convert (1.5oz -> ml): $CONVERT"

echo "### SCENARIO: Settings ###"
echo "  NOTE: no settings routes exist at all (confirmed absent in the prior production audit)."
echo "  Time zone, currency, measurement preference, active-session view, and data export"
echo "  CANNOT be tested because they are not built - this is a confirmed absent feature, not a failed test."
