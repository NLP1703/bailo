#!/bin/sh
# Référencement : finalise index.html et génère robots.txt / sitemap.xml au
# démarrage du conteneur (exécuté par l'entrypoint de l'image nginx officielle).
#
# Adresse publique du site, par ordre de priorité :
#   1. SITE_URL               — ex. https://bailo.cm (domaine personnalisé)
#   2. RAILWAY_PUBLIC_DOMAIN  — fournie automatiquement par Railway
# Sans adresse (Docker Compose local), les liens restent relatifs et le sitemap est omis.
#
# GOOGLE_SITE_VERIFICATION (facultatif) : jeton de la balise « google-site-verification »
# donné par Google Search Console (méthode « Balise HTML »).
set -eu

HTML_DIR=/usr/share/nginx/html
INDEX="$HTML_DIR/index.html"

site="${SITE_URL:-}"
if [ -z "$site" ] && [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
  site="https://${RAILWAY_PUBLIC_DOMAIN}"
fi
site=$(printf '%s' "$site" | sed -E 's#/+$##')
# Garde-fou : uniquement une origine http(s) simple (pas de caractères spéciaux pour sed/HTML).
case "$site" in
  '' ) ;;
  http://*|https://* )
    if ! printf '%s' "$site" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]+)?$'; then
      echo "bailo-seo: SITE_URL invalide ($site) — ignorée"
      site=''
    fi
    ;;
  * ) echo "bailo-seo: SITE_URL doit commencer par http(s):// — ignorée"; site='' ;;
esac

# 1) Adresse absolue dans les balises canonical / Open Graph.
sed -i "s#__SITE_URL__#${site}#g" "$INDEX"

# 2) Balise de vérification Google Search Console.
token="${GOOGLE_SITE_VERIFICATION:-}"
if [ -n "$token" ] && printf '%s' "$token" | grep -Eq '^[A-Za-z0-9_-]{10,100}$'; then
  sed -i "s#<!--__GOOGLE_SITE_VERIFICATION__-->#<meta name=\"google-site-verification\" content=\"${token}\" />#" "$INDEX"
  echo "bailo-seo: balise Google Search Console ajoutée"
elif [ -n "$token" ]; then
  echo "bailo-seo: GOOGLE_SITE_VERIFICATION invalide — ignorée"
fi

# 3) robots.txt : tout est explorable sauf l'API et les pages de vérification de reçu.
#    Les écrans privés (connexion, application) portent l'en-tête « X-Robots-Tag: noindex » (nginx).
{
  echo 'User-agent: *'
  echo 'Allow: /'
  echo 'Disallow: /api/'
  echo 'Disallow: /r/'
  if [ -n "$site" ]; then echo "Sitemap: ${site}/sitemap.xml"; fi
} > "$HTML_DIR/robots.txt"

# 4) sitemap.xml : les pages publiques uniquement.
if [ -n "$site" ]; then
  cat > "$HTML_DIR/sitemap.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${site}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${site}/privacy</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>
</urlset>
EOF
else
  rm -f "$HTML_DIR/sitemap.xml"
fi

echo "bailo-seo: site=${site:-<relatif>}"
