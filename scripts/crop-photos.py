# Crop photos for the app: downloads each chosen Wikimedia Commons photo, crops it to a square,
# saves public/crops/<slug>.webp (160 px, ~4 KB) and writes src/lib/crop-photos.ts with credits.
# Dev-only tool (needs Python 3 + Pillow). Run from the repo root:  python3 scripts/crop-photos.py [slug ...]
# Photos were chosen by hand (Oct 2026) to show the produce as sold in a mandi. To change one, edit
# PHOTOS below (Commons file name, optional crop box as fractions [x0, y0, x1, y1]) and re-run for that slug.
import io, json, re, sys, time, urllib.parse, urllib.request
from PIL import Image

PHOTOS = {
    "wheat": ("Wheat close-up.JPG", None),
    "maize": ("Ab food 06.jpg", None),
    "barley": ("Barley grains 4.jpg", None),
    "paddy": ("Oryza sativa MHNT.BOT.2015.2.52.jpg", None),
    "jowar": ("Sorghum bicolor Moderne MHNT.BOT.2015.34.152.jpg", None),
    "chana": ("Soaked and dried chickpeas.jpg", [0.5, 0, 1, 1]),
    "kabuli-chana": ("Soaked and dried chickpeas.jpg", [0, 0, 0.5, 1]),
    "masoor": ("Lens culinaris seeds.jpg", [0.4, 0.45, 1, 1]),
    "urad": ("Black gram.jpg", None),
    "moong": ("Green Mung Beans.jpg", None),
    "tur": ("Cajanus cajan MHNT.BOT.2015.2.47.jpg", None),
    "soyabean": ("Glycine max pod ripe2 Carol Rose (10220373194).jpg", None),
    "mustard": ("Mustard Seeds (8630655446).jpg", None),
    "linseed": ("Linum usitatissimum seeds, vlaszaden.jpg", None),
    "til": ("Sa white sesame seeds.jpg", None),
    "groundnut": ("Roasted Peanuts with shell.jpg", None),
    "garlic": ("Garlic bulbs and cloves.jpg", None),
    "coriander-seed": ("Coriander Seeds.jpg", None),
    "methi-seed": ("Fenugreek seeds(মেথি).JPG", None),
    "dry-chilli": ("Dried chillies 4.jpg", None),
    "ajwain": ("Trachyspermum ammi-1-xavier cottage-yercaud-salem-India.jpg", None),
    "dry-ginger": ("Dried ginger slices (1).jpg", None),
    "isabgol": ("Psyllium seed husk pile.JPG", None),
    "ashwagandha": ("Ashwagandha Roots.jpg", None),
    "kalonji": ("Nigella Sativa seed.jpg", None),
    "poppy-seed": ("Poppy seeds for sale in West Bengal, India.jpg", None),
    "onion": ("Red Onions.jpg", None),
    "potato": ("Solanum tuberosum Red Scarlett20170523 7825.jpg", None),
    "tomato": ("Tomato je.jpg", None),
    "coriander-leaves": ("Bunches of coriander leaves.jpg", None),
    "methi-leaves": ("Washed fenugreek leaves for cooking methi-chadachadi.jpg", None),
    "cauliflower": ("Stack of cauliflower heads.jpg", None),
    "cabbage": ("Fresh Cabbage vegetables.jpg", None),
    "bhindi": ("Bucket of raw okra pods.jpg", None),
    "green-chilli": ("Green chillies variety.jpg", None),
    "brinjal": ("Eggplant 3.jpg", None),
    "bottle-gourd": ("Lagenaria siceraria baby fruit.jpeg", None),
    "bitter-gourd": ("U-shaped karela 2017 A.jpg", None),
    "green-peas": ("Green pea pods.jpg", None),
    "orange": ("Mandarin Oranges (Citrus Reticulata).jpg", None)
}

UA = {'User-Agent': 'fasal-bazar/0.1 (crop thumbnails for a farmer price app; github.com/ImVivec/fasal-bazar)'}
OK_LICENSE = re.compile(r'^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+)', re.I)


def get(url, tries=6):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except urllib.error.HTTPError as e:
            if e.code == 429:  # Wikimedia rate limit: back off
                time.sleep(10 * (i + 1))
                continue
            raise
    raise RuntimeError('rate-limited')


def main(only):
    credits = {}
    try:
        old = open('src/lib/crop-photos.ts').read()
        marker = 'PhotoCredit> = '
        credits = json.loads(old[old.index(marker) + len(marker): old.rindex(';')])
    except Exception:
        pass
    for slug, (fname, box) in PHOTOS.items():
        if only and slug not in only:
            continue
        q = dict(action='query', titles='File:' + fname, prop='imageinfo', iiprop='url|extmetadata', iiurlwidth=480,
                 format='json', formatversion=2)
        ii = json.loads(get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(q)))['query']['pages'][0]['imageinfo'][0]
        md = ii['extmetadata']
        lic = md.get('LicenseShortName', {}).get('value', '')
        if not OK_LICENSE.match(lic):
            raise SystemExit(f'{slug}: licence "{lic}" is not free enough')
        img = Image.open(io.BytesIO(get(ii['thumburl']))).convert('RGB')
        if box:
            w, h = img.size
            img = img.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))
        w, h = img.size
        s = min(w, h)
        img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((160, 160), Image.LANCZOS)
        img.save(f'public/crops/{slug}.webp', 'WEBP', quality=72, method=6)
        artist = re.sub(r'<[^>]+>', '', md.get('Artist', {}).get('value', '')).strip()
        credits[slug] = {'file': fname, 'url': ii['descriptionurl'], 'license': lic, 'author': artist[:120]}
        print(f'{slug:18} {lic:14} {fname}')
        time.sleep(1.5)
    credits = {k: credits[k] for k in PHOTOS if k in credits}
    with open('src/lib/crop-photos.ts', 'w') as f:
        f.write('// GENERATED by scripts/crop-photos.py: which crop photos exist, and their credits (Wikimedia Commons).\n')
        f.write('export type PhotoCredit = { file: string; url: string; license: string; author: string };\n')
        f.write('export const PHOTOS: Record<string, PhotoCredit> = ' + json.dumps(credits, ensure_ascii=False, indent=1) + ';\n')


if __name__ == '__main__':
    main(sys.argv[1:])
