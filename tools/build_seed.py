#!/usr/bin/env python3
"""
Build the canonical ingredients.json seed for the Flagged app.

Source of truth: the ingredient terms as confirmed by the user and the
11 Quick Pack .md files in the repo.

Model (all de-duplicated / referenced by id):
  - ingredients[]  : { id, term }                          (canonical, defined once)
  - categories[]   : { id, name, parentGroup,              (canonical, defined once)
                        classification, ingredientIds[] }
  - quickPacks[]   : { id, name, categoryIds[] }           (reference categories)

parentGroup:    Allergens | Sugars | Additives | Dietary
classification: regulated | advisory | preference
"""
import json
import re
import unicodedata

# ---------------------------------------------------------------------------
# 1) Canonical categories: name -> ordered list of ingredient terms (verbatim)
# ---------------------------------------------------------------------------
CATEGORIES = {
    # --- Allergens (Big-9) ---
    "Egg": ["egg", "egg white", "egg yolk", "dried egg", "albumin", "albumen",
            "ovalbumin", "ovomucoid", "globulin", "livetin", "lysozyme",
            "mayonnaise", "meringue"],
    "Fish": ["fish", "anchovy", "cod", "salmon", "tuna", "tilapia", "haddock",
             "halibut", "pollock", "fish oil", "fish gelatin", "fish sauce", "surimi"],
    "Milk": ["milk", "cream", "butter", "buttermilk", "ghee", "casein",
             "sodium caseinate", "calcium caseinate", "caseinate", "whey",
             "whey protein", "lactose", "lactalbumin", "lactoglobulin",
             "milk solids", "milk powder", "condensed milk", "evaporated milk",
             "curd", "nougat"],
    "Peanut": ["peanut", "groundnut", "arachis oil", "peanut butter",
               "peanut flour", "beer nut", "monkey nut"],
    "Sesame": ["sesame", "sesame seed", "sesame oil", "tahini", "tahina",
               "sesamol", "benne", "gingelly", "halvah"],
    "Shellfish": ["shellfish", "crab", "lobster", "shrimp", "prawn", "crawfish",
                  "crayfish", "langoustine", "krill"],
    "Soy": ["soy", "soya", "soybean", "soybean oil", "soy lecithin", "soy protein",
            "soy protein isolate", "textured vegetable protein", "edamame", "miso",
            "tempeh", "tofu", "tamari", "natto"],
    "Tree nuts": ["almond", "brazil nut", "cashew", "chestnut", "hazelnut",
                  "filbert", "macadamia", "pecan", "pine nut", "pistachio",
                  "walnut", "marzipan", "praline", "gianduja", "nut butter"],
    "Wheat": ["wheat", "wheat flour", "whole wheat", "durum", "semolina", "spelt",
              "farro", "farina", "graham", "kamut", "bulgur", "couscous",
              "einkorn", "seitan", "vital wheat gluten", "wheat starch",
              "wheat protein"],
    # --- Additives ---
    "Artificial dyes": ["red 40", "allura red", "e129", "red 3", "erythrosine",
                        "e127", "yellow 5", "tartrazine", "e102", "yellow 6",
                        "sunset yellow", "e110", "blue 1", "brilliant blue", "e133",
                        "blue 2", "indigotine", "e132", "green 3", "fast green",
                        "e143", "citrus red 2", "artificial color", "color added",
                        "fd&c"],
    "Synthetic preservatives": ["bha", "e320", "bht", "e321", "tbhq", "e319",
                                "propyl gallate", "sodium benzoate", "e211",
                                "potassium sorbate", "e202", "calcium propionate",
                                "e282", "edta", "propylparaben"],
    "Artificial sweeteners": ["aspartame", "e951", "sucralose", "e955",
                              "acesulfame potassium", "acesulfame-k", "ace-k",
                              "e950", "saccharin", "e954", "neotame", "e961",
                              "advantame", "e969"],
    "Sugar alcohols": ["sorbitol", "e420", "xylitol", "e967", "erythritol", "e968",
                       "maltitol", "e965", "mannitol", "e421", "isomalt", "e953",
                       "lactitol"],
    "MSG & free glutamates": ["monosodium glutamate", "msg", "e621", "glutamic acid",
                             "e620", "monopotassium glutamate", "e622",
                             "calcium diglutamate", "e623",
                             "hydrolyzed vegetable protein", "hydrolyzed protein",
                             "autolyzed yeast", "yeast extract", "disodium inosinate",
                             "e631", "disodium guanylate", "e627"],
    "Nitrates & nitrites": ["sodium nitrite", "e250", "sodium nitrate", "e251",
                           "potassium nitrite", "e249", "potassium nitrate", "e252",
                           "celery powder", "celery juice"],
    "Sulfites": ["sulfur dioxide", "e220", "sodium sulfite", "e221",
                 "sodium bisulfite", "e222", "sodium metabisulfite", "e223",
                 "potassium metabisulfite", "e224", "potassium bisulfite", "e228",
                 "sulfites"],
    "Trans fats": ["partially hydrogenated", "hydrogenated oil", "hydrogenated",
                   "shortening"],
    # --- Sugars ---
    "Hidden sugars": ["sugar", "sucrose", "glucose", "dextrose", "fructose",
                      "maltose", "high fructose corn syrup", "hfcs", "corn syrup",
                      "corn syrup solids", "glucose-fructose syrup", "cane sugar",
                      "cane juice", "evaporated cane juice", "invert sugar",
                      "molasses", "honey", "agave", "agave nectar", "maple syrup",
                      "brown sugar", "coconut sugar", "date sugar", "turbinado",
                      "demerara", "muscovado", "barley malt", "rice syrup",
                      "brown rice syrup", "maltodextrin", "dextrin",
                      "fruit juice concentrate", "treacle", "golden syrup", "panela",
                      "sorghum syrup", "sucanat"],
    # --- Dietary ---
    "Gluten Sources": ["wheat", "barley", "malt", "malt extract", "malt syrup",
                       "malt vinegar", "brewer's yeast", "rye", "triticale", "spelt",
                       "farro", "kamut", "semolina", "durum", "seitan"],
    "Seed oils": ["canola oil", "rapeseed oil", "soybean oil", "corn oil",
                  "cottonseed oil", "safflower oil", "sunflower oil", "grapeseed oil",
                  "rice bran oil", "vegetable oil", "palm oil"],
}

PARENT_GROUP = {
    "Egg": "Allergens", "Fish": "Allergens", "Milk": "Allergens",
    "Peanut": "Allergens", "Sesame": "Allergens", "Shellfish": "Allergens",
    "Soy": "Allergens", "Tree nuts": "Allergens", "Wheat": "Allergens",
    "Artificial dyes": "Additives", "Synthetic preservatives": "Additives",
    "Artificial sweeteners": "Additives", "Sugar alcohols": "Additives",
    "MSG & free glutamates": "Additives", "Nitrates & nitrites": "Additives",
    "Sulfites": "Additives", "Trans fats": "Additives",
    "Hidden sugars": "Sugars",
    "Gluten Sources": "Dietary", "Seed oils": "Dietary",
}

# Classification per the app screenshots (badges: REGULATED / ADVISORY / PREFERENCE)
CLASSIFICATION = {
    # Regulated: Big-9 allergens + nitrates/nitrites + sulfites + trans fats + gluten
    "Egg": "regulated", "Fish": "regulated", "Milk": "regulated",
    "Peanut": "regulated", "Sesame": "regulated", "Shellfish": "regulated",
    "Soy": "regulated", "Tree nuts": "regulated", "Wheat": "regulated",
    "Nitrates & nitrites": "regulated", "Sulfites": "regulated",
    "Trans fats": "regulated", "Gluten Sources": "regulated",
    # Advisory
    "Artificial dyes": "advisory", "MSG & free glutamates": "advisory",
    "Artificial sweeteners": "advisory", "Sugar alcohols": "advisory",
    "Synthetic preservatives": "advisory", "Hidden sugars": "advisory",
    # Preference
    "Seed oils": "preference",
}

# ---------------------------------------------------------------------------
# 2) Quick Packs -> ordered list of category names they activate
# ---------------------------------------------------------------------------
QUICK_PACKS = [
    ("Artificial dyes", ["Artificial dyes"]),
    ("Big-9 Allergens", ["Egg", "Fish", "Milk", "Peanut", "Sesame", "Shellfish",
                          "Soy", "Tree nuts", "Wheat"]),
    ("Focus & ADHD", ["Artificial dyes", "Synthetic preservatives"]),
    ("Gluten Free", ["Gluten Sources"]),
    ("Gut Health", ["Artificial sweeteners", "Hidden sugars", "Sugar alcohols"]),
    ("Hidden sugars", ["Hidden sugars"]),
    ("MSG & free glutamates", ["MSG & free glutamates"]),
    ("Preservatives", ["Nitrates & nitrites", "Sulfites", "Synthetic preservatives"]),
    ("Seed oils", ["Seed oils"]),
    ("Sweeteners & Polyols", ["Artificial sweeteners", "Sugar alcohols"]),
    ("Trans fats", ["Trans fats"]),
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = text.lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")

def build():
    # canonical ingredient registry: term -> id
    ingredient_id_by_term = {}
    ingredients = []
    for term in sorted({t for terms in CATEGORIES.values() for t in terms}):
        iid = "ing-" + slugify(term)
        ingredient_id_by_term[term] = iid
        ingredients.append({"id": iid, "term": term})

    categories = []
    category_id_by_name = {}
    for name, terms in CATEGORIES.items():
        cid = "cat-" + slugify(name)
        category_id_by_name[name] = cid
        categories.append({
            "id": cid,
            "name": name,
            "parentGroup": PARENT_GROUP[name],
            "classification": CLASSIFICATION[name],
            "ingredientIds": [ingredient_id_by_term[t] for t in terms],
        })

    quick_packs = []
    for name, cat_names in QUICK_PACKS:
        quick_packs.append({
            "id": "pack-" + slugify(name),
            "name": name,
            "type": "simple" if len(cat_names) == 1 else "composite",
            "categoryIds": [category_id_by_name[n] for n in cat_names],
        })

    seed = {
        "schemaVersion": 1,
        "meta": {
            "description": "Bundled Flagged red-flag dictionary. Parsed into the "
                           "local database on first launch. 100% offline.",
            "parentGroups": ["Allergens", "Sugars", "Additives", "Dietary"],
            "classifications": ["regulated", "advisory", "preference"],
            "counts": {
                "ingredients": len(ingredients),
                "categories": len(categories),
                "quickPacks": len(quick_packs),
            },
        },
        "ingredients": ingredients,
        "categories": categories,
        "quickPacks": quick_packs,
    }
    return seed

if __name__ == "__main__":
    seed = build()
    out = "flagged-app/assets/data/ingredients.json"
    import os
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(seed, f, indent=2, ensure_ascii=False)
        f.write("\n")

    # ---- verification report ----
    print("Wrote", out)
    print("Unique ingredients:", len(seed["ingredients"]))
    print("Categories:", len(seed["categories"]))
    print("Quick packs:", len(seed["quickPacks"]))
    print("\nPer-category ingredient counts:")
    for c in seed["categories"]:
        print(f"  {c['name']:<26} {len(c['ingredientIds']):>3}  "
              f"[{c['classification']}, {c['parentGroup']}]")
    print("\nQuick pack -> categories:")
    for p in seed["quickPacks"]:
        print(f"  {p['name']:<24} ({p['type']}): {len(p['categoryIds'])} cat(s)")
