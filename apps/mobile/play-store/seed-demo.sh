#!/bin/bash
set -euo pipefail
# Seeds the @demo_kmb account used for the Play Store screenshots.
# LOCAL DEV ONLY — point API at a local server, never at production.
API="${API:-http://localhost:3000/api}"
EMAIL="${DEMO_EMAIL:-demo@kmb-talk.com}"
PASS="${DEMO_PASS:?set DEMO_PASS to the demo account password}"
H=(-H "Content-Type: application/json" -H "Accept-Language: en")

echo "--- register"
curl -s -X POST "$API/auth/register" "${H[@]}" \
  -d "{\"username\":\"demo_kmb\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | head -c 300; echo

echo "--- login"
TOK=$(curl -s -X POST "$API/auth/login" "${H[@]}" \
  -d "{\"emailOrPhone\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("accessToken",""))' 2>/dev/null || true)
if [ -z "$TOK" ]; then
  curl -s -X POST "$API/auth/login" "${H[@]}" -d "{\"emailOrPhone\":\"$EMAIL\",\"password\":\"$PASS\"}"; echo; exit 1
fi
echo "token: ${TOK:0:24}..."
A=(-H "Authorization: Bearer $TOK")

echo "--- exchange rate"
curl -s -X PUT "$API/currency/rate" "${H[@]}" "${A[@]}" \
  -d '{"usdToFcRate":"2900.0000","sellingRate":"2950.0000"}' | head -c 200; echo

echo "--- inventory"
curl -s -X POST "$API/inventory/personal/bulk" "${H[@]}" "${A[@]}" -d '{"items":[
 {"productName":"Savon de marseille","unitCost":"1.2000","sellingPrice":"2.0000","quantity":240,"category":"Hygiene"},
 {"productName":"Lait en poudre","unitCost":"4.5000","sellingPrice":"6.2000","quantity":64,"category":"Epicerie"},
 {"productName":"Sucre cristallise","unitCost":"1.8000","sellingPrice":"2.6000","quantity":180,"category":"Epicerie"},
 {"productName":"Riz parfume 25kg","unitCost":"28.0000","sellingPrice":"36.0000","quantity":42,"category":"Cereales"},
 {"productName":"Huile de palme 1l","unitCost":"3.3000","sellingPrice":"4.6000","quantity":96,"category":"Epicerie"},
 {"productName":"Farine de froment 25kg","unitCost":"22.0000","sellingPrice":"28.5000","quantity":34,"category":"Cereales"},
 {"productName":"Sel de cuisine 1kg","unitCost":"0.3500","sellingPrice":"0.6000","quantity":320,"category":"Epicerie"},
 {"productName":"Boite d allumettes","unitCost":"0.1000","sellingPrice":"0.2000","quantity":500,"category":"Menage"},
 {"productName":"Charbon sac 50kg","unitCost":"14.0000","sellingPrice":"19.0000","quantity":18,"category":"Menage"},
 {"productName":"Pate dentifrice","unitCost":"1.1000","sellingPrice":"1.8000","quantity":72,"category":"Hygiene"}
]}' | head -c 200; echo

sale () { # name qty price client
  curl -s -X POST "$API/sales" "${H[@]}" "${A[@]}" \
    -d "{\"productName\":\"$1\",\"qtySold\":$2,\"salePrice\":\"$3\"${4:+,\"clientName\":\"$4\"}}" | head -c 160; echo
}

echo "--- sales"
sale "Savon de marseille" 48 "2.0000" "Depot Central"
sale "Lait en poudre" 8 "6.2000" "Mama Nkuba"
sale "Sucre cristallise" 30 "2.6000" ""
sale "Riz parfume 25kg" 3 "36.0000" "Restaurant Kivu"
sale "Huile de palme 1l" 22 "4.6000" "Boutique Nyawera"
sale "Farine de froment 25kg" 4 "28.5000" "Boulangerie Simba"
sale "Sel de cuisine 1kg" 60 "0.6000" ""
sale "Boite d allumettes" 120 "0.2000" "Kiosque Ndosho"
sale "Charbon sac 50kg" 2 "19.0000" "Mama Furaha"
sale "Pate dentifrice" 12 "1.8000" "Depot Central"
sale "Savon de marseille" 36 "2.0000" "Kiosque Ndosho"
sale "Huile de palme 1l" 14 "4.6000" "Mama Nkuba"
echo "--- done"
